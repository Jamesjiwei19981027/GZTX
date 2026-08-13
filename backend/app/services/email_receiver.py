"""IMAP email receiver service"""
import imaplib
import email
import hmac
import hashlib
import base64
import logging
import re
import quopri
from email.parser import Parser
from email.header import decode_header
from typing import List, Dict, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailReceiver:
    """IMAP email receiver with HMAC verification"""

    def __init__(self):
        self.imap_host = settings.IMAP_HOST
        self.imap_port = settings.IMAP_PORT
        self.username = settings.IMAP_USER
        self.password = settings.IMAP_PASSWORD
        self.reply_domain = settings.EMAIL_REPLY_DOMAIN
        self.reply_secret = settings.EMAIL_REPLY_SECRET

    def connect(self) -> imaplib.IMAP4_SSL:
        """Connect to IMAP server"""
        if not self.username or not self.password:
            raise ValueError("IMAP credentials not configured (IMAP_USER / IMAP_PASSWORD)")
        conn = imaplib.IMAP4_SSL(self.imap_host, self.imap_port)
        conn.login(self.username, self.password)
        return conn

    def fetch_new_emails(self, folder: str = "INBOX") -> List[Dict]:
        """Fetch unseen emails and mark them as seen"""
        emails = []
        try:
            conn = self.connect()
            conn.select(folder)

            # Search for unseen emails
            status, message_ids = conn.search(None, "UNSEEN")
            if status != "OK":
                conn.logout()
                return emails

            msg_id_list = message_ids[0].split()
            for msg_id in msg_id_list:
                email_data = self._fetch_single_email(conn, msg_id)
                if email_data:
                    emails.append(email_data)
                # Mark as seen after processing
                conn.store(msg_id, "+FLAGS", "\\Seen")

            conn.logout()
        except Exception:
            logger.exception("[EmailReceiver] Failed to fetch emails")

        return emails

    def _fetch_single_email(self, conn: imaplib.IMAP4_SSL, msg_id: bytes) -> Optional[Dict]:
        """Fetch a single email by message ID"""
        try:
            status, data = conn.fetch(msg_id, "(RFC822)")
            if status != "OK":
                return None

            raw_email = data[0][1]
            msg = Parser().parsestr(raw_email.decode("utf-8", errors="replace"))

            from_addr = self._decode_header_value(msg.get("From", ""))
            to_addr = msg.get("To", "")
            subject = self._decode_header_value(msg.get("Subject", ""))
            body = self._extract_body(msg)
            # Filter quotes and signatures
            filtered_body = self.filter_email_body(body)

            return {
                "message_id": msg.get("Message-ID", msg_id.decode()),
                "from": from_addr,
                "to": to_addr,
                "subject": subject,
                "body": filtered_body,
                "raw": raw_email.decode("utf-8", errors="replace")[:2000]
            }
        except Exception:
            logger.exception("[EmailReceiver] Failed to fetch email %s", msg_id)
            return None

    def _extract_body(self, msg) -> str:
        """Extract email body, supporting quoted-printable and base64"""
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == "text/plain":
                    body = self._decode_part(part)
                    break
        else:
            body = self._decode_part(msg)
        return body

    def _decode_part(self, part) -> str:
        """Decode a part based on Content-Transfer-Encoding"""
        payload = part.get_payload(decode=False)
        encoding = part.get("Content-Transfer-Encoding", "7bit").lower()
        charset = part.get_content_charset() or "utf-8"

        if isinstance(payload, str):
            payload = payload.encode("utf-8")

        return self.decode_body_payload(payload, encoding, charset)

    def decode_body_payload(self, payload: bytes, encoding: str, charset: str) -> str:
        """Decode email body payload based on encoding"""
        try:
            if encoding == "quoted-printable":
                decoded = quopri.decodestring(payload)
            elif encoding == "base64":
                decoded = base64.b64decode(payload)
            else:
                decoded = payload
            return decoded.decode(charset, errors="replace")
        except Exception as e:
            logger.error("[EmailReceiver] decode error (%s/%s): %s", encoding, charset, e)
            return payload.decode("utf-8", errors="replace")

    def filter_email_body(self, body: str) -> str:
        """Filter out email quotes, signatures, and On...wrote patterns"""
        if not body:
            return ""

        lines = body.split("\n")
        filtered = []
        for line in lines:
            # Filter quote lines (starting with >)
            if line.strip().startswith(">"):
                continue
            # Filter signature separator (standalone --)
            if line.strip() == "--":
                break
            # Filter "On ... wrote:" pattern
            if re.match(r"^On .+ wrote:\s*$", line.strip()):
                break
            filtered.append(line)

        return "\n".join(filtered).strip()

    def extract_task_id(self, to_addr: str) -> Optional[int]:
        """
        Extract task_id from reply address and verify HMAC signature.
        Address format: reply-{task_id}-{signature}@{EMAIL_REPLY_DOMAIN}
        Signature: hmac.new(SECRET, str(task_id), sha256).hexdigest()[:16]
        """
        if not to_addr:
            return None
        try:
            # Extract local part before @
            local_part = to_addr.split("@")[0]
            # Format: reply-{task_id}-{sig}
            if not local_part.startswith("reply-"):
                return None
            parts = local_part.split("-")
            if len(parts) != 3:
                return None
            task_id = int(parts[1])
            provided_sig = parts[2]

            # HMAC signature verification
            expected_sig = hmac.new(
                self.reply_secret.encode(),
                str(task_id).encode(),
                hashlib.sha256
            ).hexdigest()[:16]

            if not hmac.compare_digest(provided_sig, expected_sig):
                logger.warning("[EmailReceiver] HMAC signature mismatch for task_id=%s", task_id)
                return None

            return task_id
        except (ValueError, IndexError) as e:
            logger.error("[EmailReceiver] extract_task_id error: %s", e)
            return None

    def generate_reply_address(self, task_id: int) -> str:
        """Generate reply address with HMAC signature"""
        sig = hmac.new(
            self.reply_secret.encode(),
            str(task_id).encode(),
            hashlib.sha256
        ).hexdigest()[:16]
        return f"reply-{task_id}-{sig}@{self.reply_domain}"

    def _decode_header_value(self, value: str) -> str:
        """Decode email header value (RFC 2047 encoded words)"""
        if not value:
            return ""
        decoded_parts = decode_header(value)
        result = []
        for part, charset in decoded_parts:
            if isinstance(part, bytes):
                result.append(part.decode(charset or "utf-8", errors="replace"))
            else:
                result.append(part)
        return "".join(result)
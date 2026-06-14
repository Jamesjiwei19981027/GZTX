"""Email command parser using dateparser for time parsing"""
import re
import dateparser
from typing import Dict


class EmailCommandParser:
    """Email command parser"""

    COMMAND_MAP = {
        "完成": "done",
        "done": "done",
        "取消": "cancel",
        "cancel": "cancel",
        "回复": "note",
        "note": "note",
        "提醒": "remind",
        "remind": "remind",
    }

    def parse(self, content: str) -> Dict:
        """Parse email content and return command with params"""
        if not content:
            return {"command": "note", "params": {"content": ""}}

        # Filter quotes and signatures first
        cleaned = self._filter_quotes_and_signatures(content)

        if not cleaned:
            return {"command": "note", "params": {"content": ""}}

        # Get first line as command
        lines = cleaned.strip().split("\n")
        first_line = lines[0].strip()

        # Split by space: first part is command, rest is params
        parts = first_line.split(" ", 1)
        cmd = parts[0]
        rest = parts[1] if len(parts) > 1 else ""

        # Look up command
        command = self.COMMAND_MAP.get(cmd)

        if command is None:
            # Unknown command, treat entire content as note
            return {"command": "note", "params": {"content": cleaned.strip()}}

        # Parse params based on command type
        params = self._parse_params(command, rest)

        return {"command": command, "params": params}

    def _filter_quotes_and_signatures(self, content: str) -> str:
        """Filter email quotes, signatures, and On...wrote patterns"""
        if not content:
            return ""
        lines = content.split("\n")
        filtered = []
        for line in lines:
            if line.strip().startswith(">"):
                continue
            if line.strip() == "--":
                break
            if re.match(r"^On .+ wrote:\s*$", line.strip()):
                break
            filtered.append(line)
        return "\n".join(filtered).strip()

    def _parse_params(self, command: str, rest: str) -> Dict:
        """Parse params based on command type"""
        if command in ("done", "cancel"):
            return {}
        if command == "note":
            return {"content": rest.strip()}
        if command == "remind":
            return self._parse_remind_params(rest)
        return {}

    def _parse_remind_params(self, rest: str) -> Dict:
        """Parse remind command params using dateparser for time"""
        params = {}
        if not rest:
            return params

        # Extract note: 备注：xxx or note: xxx
        note_match = re.search(r"备注[：:]\s*(.+)$", rest)
        if note_match:
            params["note"] = note_match.group(1).strip()
            rest = rest[:note_match.start()].strip()

        # Extract count FIRST: N次, N times, or just N at end (must be before time parsing)
        count_match = re.search(r"(?:(\d+)\s*(?:[次c]|times?)|(\d+))\s*$", rest, re.IGNORECASE)
        if count_match:
            # Group 1 is N次/Ntimes, group 2 is standalone N
            count_value = count_match.group(1) or count_match.group(2)
            params["count"] = int(count_value)
            rest = rest[:count_match.start()].strip()

        # Extract frequency: 每天/每周/每月 or daily/weekly/monthly
        freq_match = re.search(r"(每天|每周|每月|daily|weekly|monthly)", rest, re.IGNORECASE)
        if freq_match:
            params["frequency"] = freq_match.group(1)
            rest = rest[:freq_match.start()].strip() + rest[freq_match.end():].strip()

        # Parse remaining as time string using dateparser
        time_str = rest.strip()
        if time_str:
            parsed_time = dateparser.parse(time_str, languages=["zh"])
            if parsed_time:
                params["time"] = parsed_time.isoformat()
            else:
                # Keep original string if dateparser can't parse
                params["time"] = time_str

        return params
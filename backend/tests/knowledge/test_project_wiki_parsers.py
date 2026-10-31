"""Exercise installed document parsers with real, small file bodies."""
from io import BytesIO

from app.services.extraction.engines import extract_docling, extract_markitdown


def test_xlsx_preserves_sheet_content():
    from openpyxl import Workbook

    book = Workbook()
    book.active.append(['交付事项', '验收结论'])
    book.active.append(['支付接口', '尚未验收'])
    stream = BytesIO()
    book.save(stream)
    text, meta = extract_markitdown(stream.getvalue(), '验收清单.xlsx')
    assert meta['extractor'] == 'markitdown'
    assert '支付接口' in text and '尚未验收' in text


def test_pptx_preserves_slide_content():
    from pptx import Presentation

    slides = Presentation()
    slide = slides.slides.add_slide(slides.slide_layouts[1])
    slide.shapes.title.text = '交付评审'
    slide.placeholders[1].text = '支付接口尚未验收'
    stream = BytesIO()
    slides.save(stream)
    text, meta = extract_markitdown(stream.getvalue(), '交付评审.pptx')
    assert meta['extractor'] == 'markitdown'
    assert '交付评审' in text and '支付接口尚未验收' in text


def test_text_pdf_preserves_readable_body_without_ocr():
    # Minimal valid PDF with embedded text operators, no OCR or PDF generator.
    content = b'BT /F1 12 Tf 72 720 Td (Acceptance remains pending.) Tj ET'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length '+str(len(content)).encode()+b' >>\nstream\n'+content+b'\nendstream']
    body = b'%PDF-1.4\n'
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(body))
        body += f'{index} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref = len(body)
    body += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
    body += b''.join(f'{offset:010} 00000 n \n'.encode() for offset in offsets[1:])
    body += f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()
    text, meta = extract_docling(body, 'acceptance.pdf')
    assert meta['extractor'] in {'markitdown', 'docling'}
    assert 'Acceptance remains pending.' in text

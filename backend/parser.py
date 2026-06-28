import io
import pdfplumber
from google.genai import types

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extracts text from a digital PDF using pdfplumber.
    Returns empty string if the PDF is scanned or has no text.
    """
    extracted_text = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted_text.append(text)
    except Exception as e:
        print(f"Error during digital PDF text extraction: {e}")
        return ""
    
    return "\n".join(extracted_text).strip()

def perform_ocr_via_gemini(file_bytes: bytes, mime_type: str, client) -> str:
    """
    Leverages Gemini Multimodal processing to perform high-accuracy OCR
    on scanned PDFs or image uploads.
    """
    print(f"Performing OCR via Gemini for mime_type: {mime_type}...")
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(
                    data=file_bytes,
                    mime_type=mime_type
                ),
                "You are an expert clinical OCR assistant. Please extract all visible text from this pathology lab report. "
                "Retain tables, rows, values, units, and reference ranges carefully. Do not modify any numbers or values."
            ]
        )
        return response.text
    except Exception as e:
        print(f"Error during Gemini OCR: {e}")
        raise e

def parse_document(file_bytes: bytes, filename: str, client) -> str:
    """
    Main parser entrypoint. Identifies the file type and extracts raw text.
    """
    filename_lower = filename.lower()
    
    if filename_lower.endswith('.pdf'):
        # 1. Attempt local digital extraction first
        text = extract_text_from_pdf(file_bytes)
        if len(text) > 100:
            print("Successfully extracted digital text from PDF locally.")
            return text
        
        # 2. Fall back to Gemini Multimodal PDF processing if scanned
        print("PDF appears to be scanned. Falling back to Gemini Multimodal OCR.")
        return perform_ocr_via_gemini(file_bytes, 'application/pdf', client)
        
    elif filename_lower.endswith(('.png', '.jpg', '.jpeg', '.webp')):
        # For images, route directly to Gemini OCR
        mime_type = 'image/png'
        if filename_lower.endswith(('.jpg', '.jpeg')):
            mime_type = 'image/jpeg'
        elif filename_lower.endswith('.webp'):
            mime_type = 'image/webp'
            
        return perform_ocr_via_gemini(file_bytes, mime_type, client)
        
    else:
        raise ValueError("Unsupported file format. Please upload a PDF or an image (PNG, JPG, JPEG).")

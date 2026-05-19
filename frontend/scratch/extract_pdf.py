import pypdf
import sys

def extract_text(pdf_path):
    try:
        reader = pypdf.PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        print(text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_text(r"D:\Antigravity\DSS_BPKAD\DSS KAS DAERAH - BPKAD Kab. Kepulauan Aru.pdf")

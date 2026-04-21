import PyPDF2

pdf_path = '/Users/philippgassen/Downloads/Tool_ Markenrecht.pdf'

with open(pdf_path, 'rb') as file:
    reader = PyPDF2.PdfReader(file)
    text = ''
    for page in reader.pages:
        text += page.extract_text()
    print(text)
# Hugging Face Space (Docker SDK) running the Brazil Fire Calendar API.
# The processed NASA FIRMS data is not in this image: fetch_data.py downloads it from the
# dataset repo named in the HF_DATASET Space variable when the container starts.
FROM python:3.12-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/home/user/data \
    CORS_ORIGINS=*
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user . .

EXPOSE 7860
CMD ["sh", "-c", "python fetch_data.py && uvicorn main:app --app-dir api --host 0.0.0.0 --port 7860"]

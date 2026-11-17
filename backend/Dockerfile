FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOME=/home/evacway
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /app/static/uploads /home/evacway \
    && addgroup --system evacway \
    && adduser --system --home /home/evacway --ingroup evacway evacway \
    && chown -R evacway:evacway /home/evacway /app
USER evacway
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--no-control-socket", "--access-logfile", "-", "--error-logfile", "-", "app:app"]

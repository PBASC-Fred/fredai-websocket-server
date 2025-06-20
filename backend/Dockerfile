FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5005 5055

CMD ["sh", "-c", "rasa train && rasa run --enable-api --cors '*' --port 5005 & rasa run actions --port 5055"]

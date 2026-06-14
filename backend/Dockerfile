FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 创建数据目录
RUN mkdir -p /app/data/uploads

# 不 COPY 源码 - 通过 volume 挂载
# 但需要确保 app 目录存在
RUN mkdir -p /app/app

EXPOSE 8000

# 开发模式：热重载
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

Production prerequisites
------------------------
OS:
  - Ubuntu Server
  - Python 3.x

System software:
  - nginx
  - systemd
  - uv

Python (server-side API):
  - FastAPI
  - [other dependencies from pyproject.toml]

AI:
  - Ollama
  - NVIDIA drivers
  - CUDA (as required by Ollama)

Configuration:
  - environment variables / secrets
  - nginx configuration
  - systemd service
  - TLS certificate
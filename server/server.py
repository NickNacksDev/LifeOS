from PIL import Image, ImageOps, UnidentifiedImageError
from io import BytesIO

from fastapi import FastAPI, Body, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from partialjson import JSONParser
import json
import httpx
import base64


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://192.168.0.69",
        "http://localhost:4200"
    ],
    allow_methods="*",
    allow_headers="*"
)

responseSchema = {
    "properties": {
        "thinking": {
            "type": "string"
        },
        "query": {
            "type": "string"
        },
        "resendPrompt": {
            "type": "boolean"
        },
        "action": {
            "type": "string",
            "enum": ["none", "set_lights", "", "get_current_time", "set_temperature"]
        },
        "arguments": {
            "anyOf": [
                {
                    "type": "string",
                    "enum": ["none", "on", "off"]
                },
                {
                    "type": "number"
                }
            ]
        },
        "response": {
            "type": "string"
        }  
    },
    "required": [
        "thinking",
        "action",
        "arguments",
        "resendPrompt",
        "query",
        "response"
    ]
}

MAX_IMAGE_PIXELS = 25_000_000
MAX_DIMENSION = 2048
ALLOWED_FORMATS = { "JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF" }

def normalize_image(data: bytes) -> bytes:
    try:
        with Image.open(BytesIO(data)) as source:
            if source.format not in ALLOWED_FORMATS:
                raise ValueError("Unsupported image format")

            width, height = source.size
            if width * height > MAX_IMAGE_PIXELS:
                raise ValueError("Image dimensions exceed the limit")

            source.seek(0)
            image = ImageOps.exif_transpose(source)

            # Composite transparency onto white
            if (image.mode in ("RGBA", "LA") or "transparency" in image.info):
                image = image.convert("RGBA")
                background = Image.new("RGBA", image.size, "white")
                background.alpha_composite(image)
                image = background.convert("RGB")
            else:
                image = image.convert("RGB")

            image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))

            output = BytesIO()
            image.save(output, format="JPEG", quality=90, optimize=True)
            return output.getvalue()

    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Invalid or unreadable image") from exc

fullContext = []

@app.get("/")
async def root():
    return {"message": "Hello, LifeOS!"}

@app.post("/api/chat")
async def chat(message: str = Form(...), images: list[UploadFile] | None = File(None)):
    global fullContext
    image_data = []
    do_command = False

    context = {
        "role": "user",
        "content": message
    }

    if images is not None:
        for image in images:
            image_bytes = await image.read()
            image_base64 = base64.b64encode(normalize_image(image_bytes)).decode("utf-8")
            image_data.append(image_base64)
        context["images"] = image_data

    fullContext.append(context)
    
    if message:
        # Check for commands
        if message == "/help":
            do_command = True
        elif message == "/reset_context":
            do_command = True
            fullContext = []

    async def ollama_stream():
        parser = JSONParser()
        compiled_json = ""

        async with httpx.AsyncClient(timeout=120.0) as client:
            # State management to reduce traffic
            prev_thinking = False
            thinking = False
            prev_lookup = False
            lookup = False

            async with client.stream(
                "POST",
                "http://127.0.0.1:11434/api/chat",
                json={
                    "model": "chat_assistant_thinking:latest",
                    "messages": fullContext,
                    "stream": True,
                    "format": responseSchema
                }) as response:

                if response.is_error:
                    error_body = await response.aread()
                    print(f"Ollama returned HTTP {response.status_code}:")
                    print(error_body.decode("utf-8", errors="replace"))
                    response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line:
                        continue

                    # This is the full ollama JSON (parseable), containing a message.content
                    # Section which is the textual representation of Ollama's returned JSON
                    ollama_chunk = json.loads(line)

                    # Grab the content chunk of the message
                    content_chunk = ollama_chunk["message"]["content"]
                    compiled_json += content_chunk

                    # Also, log chunks as they come in
                    print(content_chunk, end="")

                    # Parse the partial JSON
                    parsed = parser.parse(compiled_json)
                    # And now check for each field. Print the field when it's complete (as a test)

                    response = ""
                    if parsed.get("response") is not None: # and parsed["action"] != "lookup": # (TODO uncomment when lookup implemented)
                        # Response means that thinking is done
                        # Lookup is handled separately (TODO)
                        thinking = False
                        ollama_stream = False # change this
                        response = json.dumps({
                            "thinking": parsed["thinking"],
                            "query": parsed["query"],
                            "resend": parsed["resendPrompt"],
                            "action": parsed["action"],
                            "args": parsed["arguments"],
                            "message": parsed["response"],
                            "done": ollama_chunk["done"],
                            "token_count": ollama_chunk["prompt_eval_count"] if ollama_chunk["done"] else "..."
                        }) + "\n"
                    elif parsed.get("action") == "lookup":
                        # Lookup definitely means thinking is complete
                        thinking = False
                        lookup = True
                        response = json.dumps({
                            "query": parsed["query"],
                            "thinking": parsed["thinking"],
                            "message": "<lookup>",
                            "done": False
                        }) + "\n"
                    else:
                        # Thinking comes before lookup (see schema definition)
                        thinking = True
                        lookup = False
                        response = json.dumps({
                            "message": "<thinking>",
                            "done": False
                        }) + "\n"

                    if ollama_chunk["done"]:
                        # Add the AI response to the context
                        fullContext.append({
                            "role": "assistant",
                            "content": response
                        })

                        # Log the message that was sent
                        print()

                    yieldThinkingMessage = thinking and not prev_thinking
                    yieldLookupMessage = lookup and not prev_lookup
                    yieldNormalMessage = not lookup and not thinking
                    if yieldThinkingMessage:
                        prev_thinking = True
                        yield response

                    if yieldLookupMessage:
                        prev_lookup = True
                        yield response

                    if yieldNormalMessage:
                        prev_lookup = False
                        prev_thinking = False
                        yield response

    commands = "/reset_context - Reset's this conversation's context"

    commandsResponse = json.dumps({
        "message": "Context has been reset."
    }) + "\n"

    return StreamingResponse(
        ollama_stream() if not do_command else commandsResponse,
        media_type="application/x-ndjson" # newline delimited json
    )
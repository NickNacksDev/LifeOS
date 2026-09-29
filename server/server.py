from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from partialjson import JSONParser
import json
import httpx

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://192.168.0.69"
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
            "enum": ["none", "set_lights", "lookup", "get_current_time", "set_temperature"]
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

fullContext = []

@app.get("/")
async def root():
    return {"message": "Hello, LifeOS!"}

@app.post("/api/chat")
async def chat(message: str = Body(..., media_type="text/plain")):

    fullContext.append({
        "role": "user",
        "content": message
    })

    async def ollama_stream():
        parser = JSONParser()
        compiled_json = ""

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                "http://127.0.0.1:11434/api/chat",
                json={
                    "model": "chat_assistant_thinking:latest",
                    "messages": fullContext,
                    "stream": True,
                    "format": responseSchema
                }
            ) as response:

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

                    # Parse the partial JSON
                    parsed = parser.parse(compiled_json)
                    # And now check for each field. Print the field when it's complete (as a test)

                    response = ""
                    if parsed.get("response") is not None and parsed["action"] != "lookup":
                        response = json.dumps({
                            "thinking": parsed["thinking"],
                            "query": parsed["query"],
                            "resend": parsed["resendPrompt"],
                            "action": parsed["action"],
                            "args": parsed["arguments"],
                            "message": parsed["response"]
                        }) + "\n"
                    elif parsed.get("action") == "lookup":
                        response = json.dumps({
                            "query": parsed["query"],
                            "thinking": parsed["thinking"],
                            "message": "<lookup>",
                            "done": False
                        }) + "\n"
                    else:
                        response = json.dumps({
                            "message": "<thinking>",
                            "done": False
                        }) + "\n"

                    print(response)
                    yield response

    return StreamingResponse(
        ollama_stream(),
        media_type="application/x-ndjson"
    )
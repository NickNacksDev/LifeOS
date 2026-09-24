// Define some important elements
const chatbox = document.getElementById("chatbox");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");

// TODO: Handle the full context on the server side.
// This will use more and more bandwidth over time.
fullContext = []

// Markdown configuration
marked.setOptions({
    gfm: true,
    breaks: false
});

/* type can be (change from string):
    "received"
    "sent"
*/
function addMessage(text, type) {

    // Create new message bubble (stylized as sent or received)
    const message = document.createElement("div");
    message.className = `message ${type}`;

    // Convert any markdown into html
    message.innerHTML = marked.parse(text);

    // Add the message to the chat window
    chatbox.appendChild(message);

    // Return an object that can be updated with the new streamed message content
    return {
        update(text) {
            message.innerHTML = marked.parse(text);

            renderMathInElement(message, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false},
                    {left: "\\(", right: "\\)", display: false},
                    {left: "\\[", right: "\\]", display: true}
                ],
                throwOnError: false
            });

            // Highlight code blocks, add copy button
            setupCodeBlocks(message);
            
            // Scroll to the newest message
            chatbox.scrollTop = chatbox.scrollHeight;
        },

        element: message
    }
}

function setupCodeBlocks(container) {
    container.querySelectorAll("pre").forEach(pre => {
        const code = pre.querySelector("code");
        if (!code) {
            return;
        }

        // Highlight syntax
        hljs.highlightElement(code);

        // Prevent duplicate copy buttons
        if (pre.parentElement.classList.contains("code-container")) {
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "code-container";
        
        // Move <pre> into wrapper
        pre.parentNode.insertBefore(
            wrapper,
            pre
        );

        wrapper.appendChild(pre);

        const button = document.createElement("button");
        button.className = "copy-button";
        button.textContent = "Copy";
        button.onclick = async () => {
            try {
                await navigator.clipboard.writeText(
                    code.innerText
                );

                button.textContent = "Copied!";
            } catch {
                button.textContent = "Failed!";
            } finally {
                setTimeout(() => {
                    button.textContent = "Copy";
                }, 1500);
            }

        };

        wrapper.appendChild(button);
    });
}

async function sendMessage() {
    // Grab user input
    const text = userInput.value.trim();

    // Do not send messages with no text / only whitespace
    if (!text) {
        return;
    }

    // Add message to dialog
    addMessage(text, "sent");

    // Clear and re-focus input
    userInput.value = "";
    userInput.focus();

    fullContext.push({
        role: "user",
        content: (new Date()).toString() + ": " + text,
    });

    // Ask the server for a response
    const response = await fetch("http://192.168.0.69:11434/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "rude:latest",
            messages: fullContext,
            stream: true
        })
    });

    if (!response.ok) {
        addMessage("Sorry, something went wrong.", "received");
        return;
    }
    
    // Add the visible message bubble
    const responseMessage = addMessage("", "received");
    
    // Get the streaming response
    const decoder = new TextDecoder();
    const reader = response.body.getReader();

    let buffer = "";
    let messageString = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, {stream: true});

        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.trim()) continue;

            const data = JSON.parse(line);
            if (data.message?.content) {
                messageString += data.message.content;
                responseMessage.update(messageString);
            }

            if (data.done) {
                // Add the assistant's context
                fullContext.push({
                    role: "assistant",
                    content: messageString,
                    messageSentAt: new Date()
                });

                return;
            }
        }
    }
}


// Handle send button press
sendButton.addEventListener(
    "click",
    sendMessage
);

// Handle ENTER event for send, but allow shift+enter for newline
userInput.addEventListener(
    "keydown",
    event => {
        
        if (event.key === "Enter" && !event.shiftKey) {
            // Ensure the user isn't in the middle of typing a code block
            const currentCursorPos = event.target.selectionStart;
            const matches = [...event.target.value.slice().matchAll("```")];
            
            if (matches.length > 0) {
                // Check to see if we are after an unfinished pair (don't send)
                if (matches[matches.length - 1].index < currentCursorPos && 
                    Boolean(matches.length % 2)) {
                    return;
                }

                // Check to see whether we are in between any 2 pairs (don't send)
                for (let i = 0; i < matches.length - 1; i += 2) {
                    if (currentCursorPos > matches[i] && currentCursorPos < matches[i + 1]) {
                        return;
                    }
                }
            }

            // If we didn't return at this point, we are ok to send
            event.preventDefault();
            sendMessage();

            // We await a response after every message...
        }

        /*
            Shift + Enter is intentionally not
            prevented, so the textarea creates
            a new line.
        */
    }
);

// +-----------------+
// | INITIAL MESSAGE |
// +-----------------+
// Bot, initial message (temporary)
const value =`Hello! What can I help you with today?`;
addMessage(value, "received");

// ollama run on server:
            //const data = JSON.parse(buffer);

// Define some important elements
const chatbox = document.getElementById("chatbox");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");
let token_count = 0;
let thinking = false;

// Contextual AI information
day_of_week=["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
current_month=["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]

fullContext = []

// Markdown configuration
marked.setOptions({
    gfm: true,
    breaks: false
});

// Determine if a generated expression looks close enough to LaTeX
// Regex looks for:
// \x
// or
// ^ or _
function looksLikeLatex(s) {
    return /\\[a-zA-Z]+|[\^_]|\s\d+\s/.test(s);
}

// Parse the LaTeX, and replace likely LaTeX function delimeters
function normalizeLatex(text) {
    let result = "";
    let i = 0;

    while (i < text.length) {
        const char = text[i];

        // Look for a potential math expression beginning with [ or (
        if (char === "[" || char === "(") {
            const open = char;
            const close = char === "[" ? "]" : ")";
            let depth = 1;
            let j = i + 1;

            while (j < text.length && depth > 0) {
                // Ignore escaped characters
                if (text[j] === "\\") {
                    j += 2;
                    continue;
                }

                if (text[j] === open) depth++;
                if (text[j] === close) depth--;

                j++;
            }

            // Found a matching closing delimiter
            if (depth === 0) {
                const content = text.slice(i + 1, j - 1);

                if (looksLikeLatex(content)) {
                    const left = open === "[" ? "\\[" : "\\(";
                    const right = close === "]" ? "\\]" : "\\)";

                    result += `${left}${content.trim()}${right}`;
                    i = j;
                    continue;
                }
            }
        }

        result += char;
        i++;
    }

    return result;
}

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
        update(text, done=false) {
            if (String(text).trim().startsWith("<think>") && !String(text).includes("</think>")) {
                if (!thinking) {
                    message.innerHTML = `
                    <div class="thinking-indicator">
                        <div class="thinking-pulse">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <span class="thinking-text">Thinking</span>
                    </div>
                    `;

                    thinking = true;
                }
                return;
            }

            if (String(text).includes("</think>")) {
                thinking = false;
                text = String(text).split("</think>")[1];
                if (!String(text).trim()) {
                    return;
                }
            }

            const parsedHTML = marked.parse(text);
            message.innerHTML = normalizeLatex(parsedHTML);
            renderMathInElement(message, {
                delimiters: [
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

    // Add date time for the AI to reference
    // const today = new Date();
    // fullContext.push({
    //     role: "system",
    //     content: `Current date/time (authoritative and real time): ${day_of_week[today.getDay()]}, \
    //     ${current_month[today.getMonth() - 1]} ${today.getDate()}, ${today.getFullYear()} \
    //     ${today.getHours()}:${today.getMinutes()} ${today.getHours() > 11 ? "PM" : "AM"}`
    // });

    // Add the user's message
    fullContext.push({
        role: "user",
        content: text
    });

    // Ask the server for a response
    const response = await fetch("http://192.168.0.69:11434/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "chat_assistant_thinking:latest",
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
                responseMessage.update(messageString, data.done);
            }

            if (data.done) {
                // Update token count
                const tokenCounter = document.getElementById("tokenCount");
                token_count = data["prompt_eval_count"] + data["eval_count"];
                tokenCounter.innerHTML = `Token count: ${token_count}`;

                // Add the assistant's context
                fullContext.push({
                    role: "assistant",
                    content: messageString
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

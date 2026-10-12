import { Component, Input, ChangeDetectorRef, inject, Output, EventEmitter } from '@angular/core';
import { Marked, parse } from 'marked';
import { ChatMessage, MessageStatus, MessageType } from '../chatmessage/chatmessage';
import { Imagepreview } from '../imagepreview/imagepreview';

const mimeTypeMap: Record<string, string> = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'bmp': 'image/bmp',
  'tif': 'image/tiff',
  'tiff': 'image/tiff',
  'heic': 'image/heic',
  'heif': 'image/heif',
  'avif': 'image/avif',
  'svg': 'image/svg+xml',
  'jxl': 'image/jxl',
  'ico': 'image/x-icon',
  'pbm': 'image/x-portable-bitmap',
  'pgm': 'image/x-portable-graymap',
  'ppm': 'image/x-portable-pixmap',
  'pnm': 'image/x-portable-anymap'
};

@Component({
    imports: [ChatMessage, Imagepreview],
    selector: 'app-chat',
    styleUrl: './chat.css',
    templateUrl: './chat.html',
})

export class Chat {
    @Output() imagePreviewChange = new EventEmitter<string[]>();
    private cdr = inject(ChangeDetectorRef);

    // Config items, separate these out at some point
    token_count: number = 0;
    messages: ChatMessage[] = [];
    lookup: boolean = false;
    thinking: boolean = false;
    debug: boolean = true;
    userInput: string = "";
    attachedFiles: Record<string, Uint8Array> = {};
    attachedFilePreviews: Array<string> = [];

    // Determine if a generated expression looks close enough to LaTeX
    // Regex looks for:
    // \x
    // or
    // ^ or _
    looksLikeLatex(s: string): boolean {
        return /\\[a-zA-Z]+|[\^_]|\s\d+\s/.test(s);
    }

    // Parse the LaTeX, and replace likely LaTeX function delimeters
    normalizeLatex(text: string): string {
        let result: string = "";
        let i: number = 0;

        while (i < text.length) {
            const char: string = text[i];

            // Look for a potential math expression beginning with [ or (
            if (char === "[" || char === "(") {
                const open: string = char;
                const close: string = char === "[" ? "]" : ")";
                let depth: number = 1;
                let j: number = i + 1;

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
                    const content: string = text.slice(i + 1, j - 1);

                    if (this.looksLikeLatex(content)) {
                        const left: string = open === "[" ? "\\[" : "\\(";
                        const right: string = close === "]" ? "\\]" : "\\)";
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
    async addMessage(text: string, type: MessageType, imageUrls?: Array<string>): Promise<ChatMessage> {
        let message: ChatMessage = new ChatMessage();
        message.messageClass = type === MessageType.received ? "message received" : "message sent";
        message.content = text;
        console.log(text);

        if (imageUrls) {
            message.images = imageUrls;
        }

        this.messages.push(message);
        return this.messages[this.messages.length - 1];
    }

    getSupportedExtension(imageUrl: string): string | null {
        const tokens: Array<string> = imageUrl.split(".");
        let extension: string = "";
        if (tokens.length > 1) {
            extension = tokens[tokens.length - 1];
            if (Object.hasOwn(mimeTypeMap, extension)) {
                return extension;
            }
        }
        
        return null;
    }

    async sendMessage(userInput: HTMLTextAreaElement) {
        const message = userInput.value;
        // Grab user input
        console.log(`user input: ${message}`);

        // Do not send messages with no text / only whitespace
        if (!message.trim()) {
            return;
        }

        const formdata = new FormData();

        // Add user message
        formdata.append("message", message);
        
        // Add images
        if (Object.keys(this.attachedFiles).length !== 0) {
            console.log("Attaching image...")

            for (let i = 0; i < Object.keys(this.attachedFiles).length; i++) {
                const filename: string = Object.keys(this.attachedFiles)[i];
                const bytes: Uint8Array = Object.values(this.attachedFiles)[i];
                const buffer = new ArrayBuffer(bytes.byteLength);
                const extension: string|null = this.getSupportedExtension(filename);
                if (!extension) {
                    console.log(`Unsupported file type: ${filename}`);
                    continue;
                }

                new Uint8Array(buffer).set(bytes);
                console.log(extension);
                console.log(mimeTypeMap[extension]);
                formdata.append(
                    'images',
                    new Blob([buffer], { type: mimeTypeMap[extension] }),
                    `image-${i + 1}.${extension}`
                );
                console.log("Image appended to form data")
            }
        }

        // Add message to dialog
        this.addMessage(message, MessageType.sent, this.attachedFilePreviews);

        // Clear and re-focus input
        this.attachedFilePreviews = [];
        this.attachedFiles = {};
        userInput.value = "";
        userInput.focus();

        // Ask the server for a response
        let response;
        try {
            console.log("Sending message")
            response = await fetch("http://192.168.0.69:8000/api/chat", {
                method: "POST",
                body: formdata
            });

            if (!response.ok) {
                console.log("Status: ", response.status);
                console.log("Response: ", response.text());
                this.addMessage("Sorry, something went wrong.", MessageType.received);
                return;
            }
        }
        catch (error) {
            this.addMessage("Error sending to server. Please try again in a few moments.", MessageType.received);
            return;
        }

        // Add the visible message bubble
        // TODO: add loading animation to bubble
        const responseMessage = await this.addMessage("", MessageType.received);

        // Get the streaming response
        const decoder = new TextDecoder();

        let buffer = "";
        let messageString = "";
        let thinking = false;
        let lookup = false;

        const reader = response.body?.getReader();
        while (reader) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const data = JSON.parse(line);
                    
                    if (data["message"] == "<thinking>" && !thinking) {
                        lookup = false;
                        thinking = true;
                        responseMessage.update(MessageStatus.thinking);
                    }
                    else if (data["message"] == "<lookup>" && !lookup) {
                        lookup = true;
                        thinking = false;
                        responseMessage.update(MessageStatus.loading);
                    }
                    else if (data["message"] != "<thinking>" && data["message"] != "<lookup>") {
                        thinking = false;
                        lookup = false;
                        responseMessage.update(MessageStatus.writing, data["message"]);
                    }
                    
                    this.cdr.markForCheck();
                    
                    if (data.done) {
                        thinking = false;
                        lookup = false;

                        this.token_count = data.token_count;
                        
                        return;
                    }
                }
                catch (error) {
                    if (error instanceof SyntaxError && (error.message.includes("Unexpected end") || error.message.includes("Unterminated"))) {
                        // It is common for log snippets of text (especially code)
                        // to trip up the partial JSON parser. This is expected.
                        console.log("Expected exception caught during JSON parsing. Continuing...");
                        continue;
                    }

                    throw error;
                }
            }
        }
    }

    printTokenCount(): string {
        return `Token count: ${this.token_count}`
    }

    onFilesSelected(event: Event) {
        const files: FileList | null = (event.target as HTMLInputElement).files;
        if (!files) {
            return;
        }

        // Process all files
        for (let i = 0; i < files.length; ++i) {
            files[i].arrayBuffer().then(value => {
                const bytes = new Uint8Array(value);
                console.log(`Added image ${files[i].name}`)

                // This is what is sent to the server
                // (right now, only 1 image can be previewed and sent, update later)
                this.attachedFiles[files[i].name] = bytes;
            });

            // This is an array reassignment, rather than a push
            // This is to allow Angular to detect the change to the array and
            // represent the change in the children
            this.attachedFilePreviews = [...this.attachedFilePreviews, URL.createObjectURL(files[i])];
        }
    }

    // Handle ENTER event for send, but allow shift+enter for newline
    onKeyDown(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey) {
            // Ensure the user isn't in the middle of typing a code block
            const textAreaElement = event.target as HTMLTextAreaElement;
            const currentCursorPos = textAreaElement.selectionStart;
            const matches = [...textAreaElement.value.slice().matchAll(/```/g)];

            if (matches.length > 0) {
                // Check to see if we are after an unfinished pair (don't send)
                if (matches[matches.length - 1].index < currentCursorPos &&
                    Boolean(matches.length % 2)) {
                    return;
                }

                // Check to see whether we are in between any 2 pairs (don't send)
                for (let i = 0; i < matches.length - 1; i += 2) {
                    if (currentCursorPos > matches[i].index && currentCursorPos < matches[i + 1].index) {
                        return;
                    }
                }
            }

            // If we didn't return at this point, we are ok to send
            event.preventDefault();
            this.sendMessage(textAreaElement);
        }

        /*
            Shift + Enter is intentionally not
            prevented, so the textarea creates
            a new line.
        */
    }
}

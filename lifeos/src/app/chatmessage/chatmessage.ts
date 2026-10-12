import { Component, EventEmitter, Input, Output, SimpleChanges, OnChanges } from '@angular/core';
import hljs from 'highlight.js'
import { Marked } from 'marked';
import { Codeblock } from '../codeblock/codeblock';

export enum MessageType {
  sent,
  received
}

export enum MessageStatus {
  writing,
  thinking,
  loading
}

export enum SegmentType {
  text,
  code
}

interface Message {
  content: string;
  messageClass: string;
  thinking?: boolean;
  html?: string;
  image?: Uint8Array;
}

interface MessageSegment {
  type: SegmentType;
  html: string;
  code: string;
  language: string;
}

@Component({
  imports: [Codeblock],
  selector: 'app-chatmessage',
  styleUrl: './chatmessage.css',
  templateUrl: './chatmessage.html',
})

export class ChatMessage implements Message, OnChanges {
  @Input() content = "";
  @Input() messageClass: string = ""; 
  @Input() images: Array<string> = [];
  
  // Expose the SegmentType enum for the html check
  segmentType = SegmentType;

  segments: Array<MessageSegment> = [];

  // Markdown configuration
  marked = new Marked({
    gfm: true,
    breaks: false
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['content']) {
        this.segments = this.parseSegments(this.content);
    }
  }

  getWaitingHtml(text: string) {
    return `
    <div class="thinking-indicator">
      <div class="thinking-pulse">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="thinking-text">${text}</span>
    </div>`;
    }

  thinking?: boolean;
  html?: string;
  image?: Uint8Array;

  parseSegments(message: string): Array<MessageSegment> {
    return this.marked.lexer(message).map(token => {
      if (token.type === 'code') {
        return {
          type: SegmentType.code,
          html: "",
          code: token.text,
          language: token.lang ?? ''
        };
      }

      return {
        type: SegmentType.text,
        html: token.raw,
        code: "",
        language: ''
      };
    });
  }

  update(status: MessageStatus, text?: string) {
    switch (status) {
      case MessageStatus.writing:
        this.content = text ? text : "";
        break;
      case MessageStatus.loading:
        this.content = this.getWaitingHtml("Loading...");
        break; 
      case MessageStatus.thinking:
        this.content = this.getWaitingHtml("Thinking...");
        break;
    }
  }
}
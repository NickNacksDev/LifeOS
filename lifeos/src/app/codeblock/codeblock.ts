import { ThisReceiver } from '@angular/compiler';
import { Component, Input, AfterViewInit, ElementRef, ViewChild, OnChanges, ChangeDetectorRef, inject } from '@angular/core';
import hljs from 'highlight.js';

@Component({
  imports: [],
  selector: 'app-codeblock',
  styleUrl: './codeblock.css',
  templateUrl: './codeblock.html',
})
export class Codeblock implements OnChanges, AfterViewInit {
  @Input() code = '';
  @Input() language = '';
  private cdr = inject(ChangeDetectorRef);

  copyButtonText: string = "Copy"

  private viewReady = false;
  @ViewChild('codeElement') codeElement!: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.highlightCode();
  }

  ngOnChanges(): void {
    if (this.viewReady) {
      this.highlightCode();
    }
  }

  highlightCode(): void {
    const element = this.codeElement?.nativeElement;
    if (!element) return;

    element.textContent = this.code;

    if (this.language && hljs.getLanguage(this.language)) {
      const result = hljs.highlight(this.code, {
        language: this.language
      });

      element.innerHTML = result.value;
    }
  }

  async copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code);
      this.copyButtonText = "Copied!";
    } catch (error) {
      this.copyButtonText = "Error!";
    }

    // Update immediately
    this.cdr.markForCheck();

    // Revert button text
    setTimeout(() => {
      this.copyButtonText = "Copy";
      this.cdr.markForCheck();
    }, 2000);
  }
}

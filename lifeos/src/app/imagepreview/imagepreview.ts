import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-imagepreview',
  styleUrl: './imagepreview.css',
  templateUrl: './imagepreview.html',
})

export class Imagepreview {
  @Input() images: Array<string> = [];
  @Output() imagesChange = new EventEmitter<string[]>();

  removeImage(imgUrl: string): void {
    this.images = this.images.filter(image => image != imgUrl);
    this.imagesChange.emit(this.images);
  }
}

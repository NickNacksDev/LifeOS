import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class Navbar {
  @Input() activePage = 'chat';
  @Output() pageSelected = new EventEmitter<string>();

  selectPage(page: string) {
    this.pageSelected.emit(page);
  }
}
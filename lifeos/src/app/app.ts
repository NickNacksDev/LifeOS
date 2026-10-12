import { Component } from '@angular/core';
import { Navbar } from './navbar/navbar';
import { Chat } from './chat/chat';
import { Calendar } from './calendar/calendar';

@Component({
  selector: 'app-root',
  imports: [Navbar, Chat, Calendar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})

export class App {
  activePage = 'chat';

  selectPage(page: string) {
    this.activePage = page;
  }
}
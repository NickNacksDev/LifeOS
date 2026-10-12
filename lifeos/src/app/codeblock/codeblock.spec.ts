import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Codeblock } from './codeblock';

describe('Codeblock', () => {
  let component: Codeblock;
  let fixture: ComponentFixture<Codeblock>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Codeblock],
    }).compileComponents();

    fixture = TestBed.createComponent(Codeblock);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

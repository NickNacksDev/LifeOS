import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Imagepreview } from './imagepreview';

describe('Imagepreview', () => {
  let component: Imagepreview;
  let fixture: ComponentFixture<Imagepreview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Imagepreview],
    }).compileComponents();

    fixture = TestBed.createComponent(Imagepreview);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

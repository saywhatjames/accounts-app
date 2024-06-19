import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { HttpClientModule } from '@angular/common/http';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let app: AppComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RouterTestingModule,
        HttpClientModule
      ],
      declarations: [
        AppComponent
      ],
    }).compileComponents();
  });

  beforeEach(()=> {
     fixture = TestBed.createComponent(AppComponent);
     app = fixture.componentInstance;
  })

  it('should create the app', () => {
 
    expect(app).toBeTruthy();
  });

  it(`should have as title 'cibc-app'`, () => {

    expect(app.title).toEqual('cibc-app');
  });

  it(`should return sum of balance of all accounts`, () => {
    const accounts = [
      {
        "type": "INVESTMENT",
        "balance": 565656,
        "id": "12345678918"
      },
      {
        "type": "CHEQUE",
        "balance": 2323232,
        "id": "12345678919"
      },
      {
        "type": "INVESTMENT",
        "balance": 3333,
        "id": "12345678920"
      },
      {
        "type": "SAVING",
        "balance": 77777,
        "id": "12345678921"
      },
      {
        "id": "0850",
        "type": "",
        "balance": 0
      },
      {
        "id": "f842",
        "type": "",
        "balance": 0
      },
      {
        "id": "4339",
        "type": "",
        "balance": 0
      },
      {
        "id": "db02",
        "type": "123",
        "balance": "03213"
      },
      {
        "id": "4e1f",
        "type": "TFSA2",
        "balance": "123213123"
      },
      {
        "id": "fcc4",
        "type": "SAVING",
        "balance": 123
      },
      {
        "id": "3572",
        "type": "SAVING",
        "balance": 12355
      }
    ]


    const total = app.balanceSumUp(accounts)

    expect(total).toEqual(126198812);
  });


});

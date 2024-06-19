import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'cibc-app';
  url = 'http://localhost:3000/accounts';


  accounts: any = [];
  accountType: string = '';
  balance: number = 0;
  accountTypeOptions = ['SAVING', 'CHEQUE', 'RRSP', 'RESP', 'TFSA', 'INVESTMENT', 'USSAVING', 'USCHEQUE']



  constructor(private http: HttpClient) {

  }

  ngOnInit() {
    this.getAccounts();


  }


  getAccounts() {
    this.http.get(this.url).subscribe((_data: any) => {
      this.accounts = _data;
      this.balanceSumUp(this.accounts);
    })
  }

  sort() {
    this.accounts.sort((a: any, b: any) => a.balance - b.balance)
  }
  addAccount(_type: string, _balance: number) {
    let _payload = {
      "type": _type,
      "balance": _balance
    }
    this.http.post(this.url, _payload).subscribe(
      _data => this.accounts.push(_data)
    )
  }

  delete(_id: number) {
    this.http.delete(`${this.url}/${_id}`).subscribe(
      _data => this.getAccounts()
    )
  }

  balanceSumUp(accounts: any): number | BigInt {
    let total = 0;
    accounts.forEach((e:any) => {
      total = total + (Number(e.balance))
    });
    // total = accounts.reduce(
    //   (sum: any, val: any) => sum + val?.balance, 0)

    console.log(total);

    return total ;

  }



}

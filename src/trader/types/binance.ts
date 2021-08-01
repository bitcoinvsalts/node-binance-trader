// Return type for getting current margin loans
export interface Loan {
    borrowed: number
    interest: number
}

// Return type for borrow and repay margin loans
export interface LoanTransaction {
    tranId: number
}
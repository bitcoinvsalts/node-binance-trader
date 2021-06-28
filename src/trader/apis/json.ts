import BigNumber from "bignumber.js"

// Converts to JSON using object type definitions
export function toJSON(object: any): string {
    if (typeof object != 'string') {
        // Temporarily change the toJSON functions for BigNumber and Date so that it includes the type name for restoring
        const originalBigNumber = BigNumber.prototype.toJSON
        const originalDate = Date.prototype.toJSON
        BigNumber.prototype.toJSON = function toJSON(): any {
            return {
                _type: 'BigNumber',
                value: this.toFixed(),
            }
        }
        Date.prototype.toJSON = function toJSON(): any {
            return {
                _type: 'Date',
                value: this.toISOString(),
            }
        }

        const json = JSON.stringify(object)

        // Restore original functions
        BigNumber.prototype.toJSON = originalBigNumber
        Date.prototype.toJSON = originalDate

        return json
    }
    return object
}

// Check for BigNumber and Date to reconstruct correctly
function reviveJSON(key: string, value: any) {
    if ((typeof value == 'object' && value != null) && (value.hasOwnProperty('_type'))) {
        switch (value._type) {
            case 'BigNumber':
                return new BigNumber(value.value)
            case 'Date':
                return new Date(value.value)
        }
    }
    return value;
}

// Restores JSON to an object
export function fromJSON(json: string) {
    return JSON.parse(json, reviveJSON)
}
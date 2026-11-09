/** In-memory datasets produced for the optional contextual panels. */
let current=null;
export function setCurrentDataset(result){current=result;}
export function getCurrentDataset(){return current;}
export function clearCurrentDataset(){current=null;}

declare module 'tesseract.js' {
  export function createWorker(options?: any): any;
  export function recognize(...args: any[]): any;
// tesseract typings stub — OCR is disabled in the prototype
  const Tesseract: any;
  export default Tesseract;
}

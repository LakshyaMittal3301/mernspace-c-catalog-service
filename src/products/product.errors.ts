export class DuplicateProductNameError extends Error {
    constructor(name: string) {
        super(`Product already exists with name ${name}`);
        this.name = "DuplicateProductNameError";
    }
}

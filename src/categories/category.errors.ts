export class DuplicateCategoryNameError extends Error {
    constructor(name: string) {
        super(`Category already exists with name ${name}`);
        this.name = "DuplicateCategoryNameError";
    }
}

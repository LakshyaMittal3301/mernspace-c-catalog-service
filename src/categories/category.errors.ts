export class DuplicateCategoryNameError extends Error {
    constructor(name: string) {
        super(`Category already exists with name ${name}`);
        this.name = "DuplicateCategoryNameError";
    }
}

export class CategoryNotFoundError extends Error {
    constructor(id: string) {
        super(`Category does not exist with id ${id}`);
        this.name = "CategoryNotFoundError";
    }
}

export class CategoryArchivedError extends Error {
    constructor(id: string) {
        super(`Category is archived with id ${id}`);
        this.name = "CategoryArchivedError";
    }
}

export class AttributeNotFoundError extends Error {
    constructor(id: string) {
        super(`Attribute does not exist with id ${id}`);
        this.name = "AttributeNotFoundError";
    }
}

export class InvalidOperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidOperationError";
    }
}

export class OptionNotFoundError extends Error {
    constructor(id: string) {
        super(`Option with id does not exist ${id}`);
        this.name = "OptionNotFoundError";
    }
}

export class ProductNotFoundError extends Error {
    constructor(id: string) {
        super(`Product ${id} not found`);
        this.name = "ProductNotFoundError";
    }
}
export class ProductArchivedError extends Error {
    constructor(id: string) {
        super(`Product ${id} is archived`);
        this.name = "ProductArchivedError";
    }
}
export class DuplicateProductNameError extends Error {
    constructor(name: string) {
        super(`Product name '${name}' already exists`);
        this.name = "DuplicateProductNameError";
    }
}
export class ForbiddenTenantUpdateError extends Error {
    constructor() {
        super("Cannot modify another tenant's product");
        this.name = "ForbiddenTenantUpdateError";
    }
}
export class InvalidImageKeyError extends Error {
    constructor() {
        super("Image key does not match product tenant prefix");
        this.name = "InvalidImageKeyError";
    }
}

export class DomainValidationError extends Error {
    constructor(msg: string) {
        super(msg);
        this.name = "DomainValidationError";
    }
}

export class ModificationNotFoundError extends Error {
    constructor(id: string) {
        super(`Modification ${id} not found`);
        this.name = "ModificationNotFoundError";
    }
}
export class BaseRadioConflictError extends Error {
    constructor() {
        super("A base radio modification already exists");
        this.name = "BaseRadioConflictError";
    }
}
export class CannotDeleteBaseRadioError extends Error {
    constructor() {
        super("Cannot delete base radio; switch base first");
        this.name = "CannotDeleteBaseRadioError";
    }
}

export interface ICategoryService {
    create(): Promise<void>;
}

export class CategoryService implements ICategoryService {
    async create(): Promise<void> {
        return;
    }
}

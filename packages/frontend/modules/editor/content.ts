import { makeAutoObservable } from 'mobx';

export class Content {
    content: string = '';

    constructor() {
        makeAutoObservable(this);
    }

    setContent(content: string) {
        this.content = content;
    }

    publish() {
        console.log(this.content);
    }
}

export const contentService = new Content();

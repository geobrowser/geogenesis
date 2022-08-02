import TurndownService from 'turndown';
// This can come through context or something dependency injected as well
import { contentService } from '~/modules/editor/content';

const turndown = new TurndownService({
    // Just using some default rules for now. They _should_ be defaulted internally, but it's
    // not working for some reason. We get a runtime error.
    headingStyle: 'setext',
    hr: '* * *',
    bulletListMarker: '*',
    codeBlockStyle: 'indented',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
    br: '  ',
});

export function PublishButton() {
    const onPublish = () => console.log(turndown.turndown(contentService.content));

    return (
        <button className='rounded-2xl px-6 py-4 bg-blue-700 text-slate-100 font-bold shadow-lg' onClick={onPublish}>
            Publish
        </button>
    );
}

export const DAILY_ACTIVITIES_PROGRESS_COLOR = '#6833FF';

export const RANKING_ACTIVITY_DESCRIPTION = 'Rank top content to impact what people see';

export const UPLOAD_ACTIVITY_TITLE = 'Upload a news story';

export const UPLOAD_ACTIVITY_DESCRIPTION = 'Spaces are communities of people organized around a shared interest';

export type DailyActivityTask =
  | {
      kind: 'ranking';
      id: string;
      blockId: string;
      title: string;
      description: string;
    }
  | {
      kind: 'upload';
      id: 'upload-news-story';
      title: string;
      description: string;
    };

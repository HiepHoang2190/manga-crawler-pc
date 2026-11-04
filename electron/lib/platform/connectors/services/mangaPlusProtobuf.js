/**
 * MangaPlus protobuf schema + decode helpers.
 * JSON format (?format=json) is blocked by nginx with HTTP 403; use binary protobuf.
 */

const protobuf = require('protobufjs');

const ROOT = protobuf.Root.fromJSON({
  nested: {
    MangaPlus: {
      nested: {
        Chapter: {
          fields: {
            titleId: { type: 'uint32', id: 1 },
            chapterId: { type: 'uint32', id: 2 },
            name: { type: 'string', id: 3 },
            subTitle: { type: 'string', id: 4 },
            thumbnailUrl: { type: 'string', id: 5 },
            startTimeStamp: { type: 'uint32', id: 6 },
            endTimeStamp: { type: 'uint32', id: 7 },
            alreadyViewed: { type: 'bool', id: 8 },
            isVerticalOnly: { type: 'bool', id: 9 },
          },
        },
        ChapterListGroup: {
          fields: {
            chapterNumbers: { type: 'string', id: 1 },
            firstChapterList: { rule: 'repeated', type: 'Chapter', id: 2 },
            midChapterList: { rule: 'repeated', type: 'Chapter', id: 3 },
            lastChapterList: { rule: 'repeated', type: 'Chapter', id: 4 },
          },
        },
        Title: {
          fields: {
            titleId: { type: 'uint32', id: 1 },
            name: { type: 'string', id: 2 },
            author: { type: 'string', id: 3 },
            portraitImageUrl: { type: 'string', id: 4 },
            landscapeImageUrl: { type: 'string', id: 5 },
            viewCount: { type: 'uint32', id: 6 },
            language: { type: 'int32', id: 7 },
          },
        },
        MangaPage: {
          fields: {
            imageUrl: { type: 'string', id: 1 },
            width: { type: 'uint32', id: 2 },
            height: { type: 'uint32', id: 3 },
            type: { type: 'int32', id: 4 },
            encryptionKey: { type: 'string', id: 5 },
          },
        },
        Page: {
          fields: {
            mangaPage: { type: 'MangaPage', id: 1 },
          },
        },
        MangaViewer: {
          fields: {
            pages: { rule: 'repeated', type: 'Page', id: 1 },
            chapterId: { type: 'uint32', id: 2 },
            titleName: { type: 'string', id: 5 },
            chapterName: { type: 'string', id: 6 },
            titleId: { type: 'uint32', id: 9 },
          },
        },
        PopupOsDefault: {
          fields: {
            subject: { type: 'string', id: 1 },
            body: { type: 'string', id: 2 },
          },
        },
        ErrorResult: {
          fields: {
            action: { type: 'int32', id: 1 },
            englishPopup: { type: 'PopupOsDefault', id: 2 },
            spanishPopup: { type: 'PopupOsDefault', id: 3 },
            debugInfo: { type: 'string', id: 4 },
          },
        },
        TitleDetailView: {
          fields: {
            title: { type: 'Title', id: 1 },
            titleImageUrl: { type: 'string', id: 2 },
            overview: { type: 'string', id: 3 },
            backgroundImageUrl: { type: 'string', id: 4 },
            nextTimeStamp: { type: 'uint32', id: 5 },
            updateTiming: { type: 'int32', id: 6 },
            viewingPeriodDescription: { type: 'string', id: 7 },
            nonAppearanceInfo: { type: 'string', id: 8 },
            firstChapterList: { rule: 'repeated', type: 'Chapter', id: 9 },
            lastChapterList: { rule: 'repeated', type: 'Chapter', id: 10 },
            chapterListGroup: { rule: 'repeated', type: 'ChapterListGroup', id: 28 },
          },
        },
        SuccessResult: {
          fields: {
            titleDetailView: { type: 'TitleDetailView', id: 8 },
            mangaViewer: { type: 'MangaViewer', id: 10 },
          },
        },
        Response: {
          fields: {
            success: { type: 'SuccessResult', id: 1 },
            error: { type: 'ErrorResult', id: 2 },
          },
        },
      },
    },
  },
});

const ResponseType = ROOT.lookupType('MangaPlus.Response');

/**
 * Decode MangaPlus API protobuf Response into a plain object.
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @returns {{success?: object, error?: object}}
 */
function decodeMangaPlusResponse(buffer) {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : buffer instanceof Uint8Array
        ? buffer
        : Buffer.from(buffer);
  const message = ResponseType.decode(bytes);
  return ResponseType.toObject(message, {
    longs: Number,
    enums: Number,
    bytes: String,
    defaults: false,
    arrays: true,
    objects: true,
  });
}

/**
 * Human-readable error from protobuf ErrorResult when present.
 * @param {object|undefined} errorResult
 * @returns {string}
 */
function formatMangaPlusApiError(errorResult) {
  if (!errorResult || typeof errorResult !== 'object') {
    return 'API không trả success.';
  }
  const englishBody =
    errorResult.englishPopup && errorResult.englishPopup.body
      ? String(errorResult.englishPopup.body)
      : '';
  const debugInfo = errorResult.debugInfo ? String(errorResult.debugInfo) : '';
  const text = englishBody || debugInfo;
  return text ? `API lỗi: ${text}` : 'API không trả success.';
}

module.exports = {
  decodeMangaPlusResponse,
  formatMangaPlusApiError,
  ResponseType,
};

import { ContentId, ContentType } from '../../../../src/cms'
import { testDirectus } from '../../helpers/directus.helper'

export async function createContents(
  contentTypePerId: Record<string, ContentType>
): Promise<void> {
  const directus = testDirectus()
  for (const id of Object.keys(contentTypePerId)) {
    await directus.createContent(new ContentId(contentTypePerId[id], id))
  }
}

export async function deleteContents(
  contentTypePerId: Record<string, ContentType>
): Promise<void> {
  const directus = testDirectus()
  for (const id of Object.keys(contentTypePerId)) {
    await directus.deleteContent(new ContentId(contentTypePerId[id], id))
  }
}

export function generateRandomUUID() {
  let dt = new Date().getTime()
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    function (c) {
      const r = (dt + Math.random() * 16) % 16 | 0
      dt = Math.floor(dt / 16)
      return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16)
    }
  )
  return uuid
}

import CONFIG from 'config'
import { getRedirection } from './anticipate_redirection.js'
import { getCachedPage, populateCache } from './cache.js'
import { setPageMetadata } from './get_page_metadata.js'
import { getPrerenderedPage } from './prerender_page.js'
import { dropIgnoredParameters, getPrerenderedUrl } from './rewrite_url.js'

const { preUrlPadding } = CONFIG.logs

export async function controller (req, res) {
  try {
    let requestedUrl = decodeURIComponent(req.url.slice(1))
    console.log('GET'.padEnd(preUrlPadding), requestedUrl)
    const urlData = new URL(requestedUrl)
    const { searchParams } = urlData
    const refresh = searchParams.get('__refresh') === 'true'
    dropIgnoredParameters(urlData)
    requestedUrl = urlData.toString()
    const prerenderedUrl = getPrerenderedUrl(req, urlData)
    console.log('rewritten'.padEnd(preUrlPadding), prerenderedUrl)
    await prerender({ res, prerenderedUrl, requestedUrl, refresh })
  } catch (err) {
    handleError(res, err)
  }
}

async function prerender ({ res, prerenderedUrl, requestedUrl, refresh }) {
  const earlyRedirection = await getRedirection(prerenderedUrl)
  if (earlyRedirection) {
    res.redirect(earlyRedirection)
    return
  }
  const rawHtml = await getCachedOrPrerenderedPage(res, prerenderedUrl, refresh)
  const { statusCode, html, headers, canonicalUrl } = setPageMetadata(rawHtml)
  if (statusCode === 200) {
    if (canonicalUrl !== requestedUrl) {
      res.redirect(canonicalUrl)
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      setHeaders(res, headers)
      res.send(html)
    }
  } else if (statusCode === 302) {
    res.redirect(canonicalUrl)
  } else {
    setHeaders(res, headers)
    res.status(statusCode).send(html)
  }
}

/**
 * @param {string} prerenderedUrl
 */
async function getCachedOrPrerenderedPage (res, prerenderedUrl, refresh) {
  if (!refresh) {
    const cachedPageData = await getCachedPage(prerenderedUrl)
    if (cachedPageData) return cachedPageData
  }
  const html = await getPrerenderedPage(res, prerenderedUrl, refresh)
  populateCache(prerenderedUrl, html)
  return html
}

function handleError (res, err) {
  console.error(err)
  res.statusCode = 500
  const { message } = err
  res.end(JSON.stringify({ message }))
}

function setHeaders (res, headers) {
  for (const [ name, value ] of Object.entries(headers)) {
    res.setHeader(name, value)
  }
}

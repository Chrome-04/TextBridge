# Make the public homepage discoverable on Google

On November 8, the deployed homepage returned HTTP 200 but still had the demo's
`noindex, nofollow` meta tag. Google is instructed not to index a page with that
tag. The local source now allows homepage indexing, describes text/file sharing,
sets the canonical homepage URL, and includes robots.txt and a homepage-only sitemap.
These updates have not been deployed by the assistant.

The Firebase Hosting config applies `X-Robots-Tag: noindex, nofollow` to `/receive`
and `/receive/**`. Crawlers must still be allowed to fetch these routes to read
that header. Do not add Receive, codes, links with code fragments, or payload URLs
to the sitemap. Robots instructions are not security controls: backend access
checks and expiry still enforce content access.

## Verify the site in Search Console

1. Open https://search.google.com/search-console/ and add a property.
2. Choose **URL prefix**, then enter `https://textbridge-8c8a4.web.app/`.
   Use URL-prefix verification because you do not control DNS for Google's web.app
   parent domain.
3. Choose **HTML tag** under the available verification methods. Copy the complete
   `google-site-verification` meta tag into the `<head>` of index.html. Keep this
   tag after verification. The verification tag is published on the website;
   it is not a backend API secret.
4. If you choose **HTML file upload** instead, put the downloaded file unchanged
   in `public/`, keeping its original name and content. Do not put it directly in
   dist/, because the next build replaces dist/.

## Publish the changes yourself

From the app directory in VS Code's terminal:

```sh
npm run build:public
```

```sh
./node_modules/.bin/firebase deploy --only hosting --config firebase.hosting.json --project textbridge-8c8a4
```

This uses the locally configured contact details in the public website. Git pushes
and Firebase deployment are separate; private backend environment files are not
part of the Hosting upload. No backend function redeployment is needed for these
homepage/search changes.

## Submit the homepage

1. Confirm the verification tag/file is available on the public website, then
   click **Verify** in Search Console.
2. In **Sitemaps**, submit `sitemap.xml`.
3. In **URL inspection**, inspect `https://textbridge-8c8a4.web.app/`, use **Test
   live URL**, confirm it is eligible for indexing, then choose **Request indexing**.
4. Monitor the Page indexing report. Requests do not guarantee indexing or ranking.
   Google says crawling can take a few days to a few weeks. Repeatedly requesting
   the same URL does not speed it up.

The screenshot shows other products already using the name TextBridge. A descriptive
page title helps distinguish this app; it does not guarantee first place for that
name. Linking the app from your portfolio or project README also helps people find it.

References:
[noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing),
[ownership verification](https://support.google.com/webmasters/answer/9008080),
[request indexing](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl),
[sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[page titles](https://developers.google.com/search/docs/appearance/title-link).

// /welcome declares its own `openGraph` metadata, and that replaces the image
// inherited from the app root — so `/` (the URL people actually paste) unfurled
// bare while /pricing had a picture. Same fix as WellNoted: give the segment its
// own file-convention image by re-export, with no URL to keep in sync.
export { default, alt, size, contentType } from '../opengraph-image'

import { IMAGE_HEALTH_MESSAGE, loadHealthImages } from '../../lib/image-health';

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (sender.id !== browser.runtime.id || msg?.type !== IMAGE_HEALTH_MESSAGE) return;

	// Each batch gets a new network cache and cookie jar in Chromium.
	const frame = document.createElement('iframe');
	frame.setAttribute('credentialless', '');
	frame.addEventListener(
		'load',
		() => {
			loadHealthImages(msg.urls, frame.contentDocument!)
				.then(sendResponse, () => sendResponse(null))
				.finally(() => frame.remove());
		},
		{ once: true }
	);
	document.body.append(frame);
	return true;
});

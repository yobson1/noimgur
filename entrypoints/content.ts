export default defineContentScript({
	matches: ['<all_urls>'],
	runAt: 'document_idle',

	main() {
		browser.runtime.onMessage.addListener((msg) => {
			if ((msg as { type: string }).type === 'NOIMGUR_INIT') {
				const hasImgur = document.querySelector('img[src*="imgur.com"]');
				if (hasImgur) location.reload();
			}
		});
	}
});

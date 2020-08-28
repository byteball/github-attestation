/*jslint node: true */
'use strict';
const desktopApp = require('ocore/desktop_app.js');
const conf = require('ocore/conf');
const pairingProtocol = process.env.testnet ? 'obyte-tn:' : 'obyte:';

/**
 * responses for clients
 */
exports.greeting = () => {
	return [
		"Here you can attest your GitHub username.\n\n",

		"Your GitHub username will be linked to your Obyte address, the link can be either made public (if you choose so) or saved privately in your wallet. ",
		"In the latter case, only a proof of attestation will be posted publicly on the distributed ledger. ",

		conf.bAllowProofByPayment ? `\n\nThe price of attestation is ${conf.priceInBytes/1e9} GB. The payment is nonrefundable even if the attestation fails for any reason.` : '',
	].join('');
};

exports.insertMyAddress = () => {
	return [
		"Please send me your address that you wish to attest (click ... and Insert my address).\n\n",
		"Make sure you are in a single-address wallet. ",
		"If you don't have a single-address wallet, ",
		"please add one (burger menu, add wallet) and fund it with the amount sufficient to pay for the attestation."
	].join('');
};


exports.goingToAttestAddress = (address) => {
	return `Thanks, going to attest your Obyte address: ${address}.`;
};

exports.goingToAttestUsername = (username) => {
	return `Going to attest GitHub username: ${username}`;
};

exports.otherOptions = (options) => {
	return `Other options: ${options}`;
};

exports.privateOrPublic = () => {
	return [
		"Store your GitHub username privately in your wallet or post it publicly?\n\n",
		"[private](command:private)\t[public](command:public)"
	].join('');
};

exports.privateChosen = () => {
	return [
		"Your GitHub username will be kept private and stored in your wallet.\n\n",
		"Click [public](command:public) now if you changed your mind."
	].join('');
};

exports.publicChosen = (username) => {
	return [
		"Your GitHub username "+username+" will be posted into the public database and will be visible to everyone. You cannot remove it later.\n\n",
		"Click [private](command:private) now if you changed your mind."
	].join('');
};

exports.pleasePay = (receivingAddress, price, user_address, challenge) => {
	if (conf.bAllowProofByPayment){
		let text = `Please pay for the attestation: [attestation payment](${pairingProtocol}${receivingAddress}?amount=${price}&single_address=single${user_address}).\n\nAlternatively, you can prove ownership of your address by signing a message: [message](sign-message-request:${challenge})`;
		return text;
	}
	else
		return `Please prove ownership of your address by signing a message: [message](sign-message-request:${challenge}).`;
};

exports.pleasePayOrPrivacy = (receivingAddress, price, user_address, challenge, postPublicly) => {
	return (postPublicly === null) ? exports.privateOrPublic() : exports.pleasePay(receivingAddress, price, user_address, challenge);
};


exports.receivedAndAcceptedYourPayment = (amount) => {
	return `Received your payment of ${amount/1e9} GB.`;
};

exports.receivedYourPayment = (amount) => {
	return `Received your payment of ${amount/1e9} GB, waiting for confirmation. It should take 5-15 minutes.`;
};

exports.paymentIsConfirmed = () => {
	return "Your payment is confirmed.";
};

exports.switchToSingleAddress = () => {
	return "Make sure you are in a single-address wallet, otherwise switch to a single-address wallet or create one and send me your address before paying.";
};

exports.alreadyAttested = (attestationDate) => {
	return `You were already attested at ${attestationDate} UTC. Attest [again](command: again)?`;
};

exports.currentAttestationFailed = () => {
	return "Your attestation failed. Try [again](command: again)?";
};
exports.previousAttestationFailed = () => {
	return "Your previous attestation failed. Try [again](command: again)?";
};

exports.proveUsername = (link) => {
	return "To let us know your GitHub username and to prove it, please follow this link "+link+"\nand log into your GitHub account, then return to this chat.";
};

exports.gotYourUsername = () => {
	return 'Got your username.';
};

exports.closeThisWindow = () => {
	return 'Now you can close this window and get back to the chat in the wallet.';
};

exports.failedAuthentication = () => {
	return 'Failed to get your GitHub profile.';
};

exports.returnChatInsertAddressAgain = () => {
	return'Please return to chat, insert your address, and try again.';
};

exports.invalidSessionParams = () => {
	return 'no code or no state';
};

exports.expiredSessionParams = () => {
	return 'Invalid or expired authentication session.';
};

/**
 * errors initialize bot
 */
exports.errorInitSql = () => {
	return "please import db.sql file\n";
};

exports.errorConfigEmail = () => {
	return `please specify admin_email and from_email in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

exports.errorConfigSalt = () => {
	return `please specify salt in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

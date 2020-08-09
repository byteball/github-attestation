/*jslint node: true */
'use strict';
const constants = require('ocore/constants.js');
const conf = require('ocore/conf');
const db = require('ocore/db');
const eventBus = require('ocore/event_bus');
const validationUtils = require('ocore/validation_utils');
const texts = require('./modules/texts');
const githubAttestation = require('./modules/github_attestation');
const notifications = require('./modules/notifications');
const { createOAuthAppAuth } = require("@octokit/auth-oauth-app");
const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const request = require('request');
const path = require('path');
const util = require('util');

const pairingProtocol = process.env.testnet ? 'obyte-tn:' : 'obyte:';

const auth = createOAuthAppAuth({
	clientId: conf.GithubClientId,
	clientSecret: conf.GithubClientSecret
});

function getLoginURL(state) {
	// WORKAROUND: chat only works with URLs with one parameter
	return conf.site + '/login?state='+ state;
}

function getLoginRedirectURL(state, fetchOrganizations) {
	let scope = fetchOrganizations ? 'read:org' : '';
	return 'https://github.com/login/oauth/authorize?client_id='+ conf.GithubClientId +'&scope='+ scope +'&state='+ encodeURIComponent(state);
}

function startWebServer(){
	const app = express();
	const server = require('http').Server(app);

	app.use(cookieParser());
	app.use(bodyParser.urlencoded({ extended: false }));

	// view engine setup
	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'ejs');

	app.get('/', async (req, res) => {
		let device = require('ocore/device.js');
		let arrAttestations = await db.query(`SELECT user_address, github_id, github_username, attestation_unit, attestation_date
			FROM receiving_addresses
			JOIN transactions USING (receiving_address)
			JOIN attestation_units USING (transaction_id)
			WHERE post_publicly = 1
			ORDER BY attestation_units.rowid DESC;`
		);
		let pairWithBot = pairingProtocol + device.getMyDevicePubKey()+"@"+conf.hub+"#"+conf.permanent_pairing_secret;
		res.render('index.ejs', {
			arrAttestations,
			pairWithBot,
			pairingProtocol,
			atob: (a) => {return new Buffer.from(String(a), 'base64').toString('utf8') || ''},
		});
	});
	app.get('/login-user', (req, res) => {
		return res.redirect(getLoginRedirectURL(req.query.state, false));
	});
	app.get('/login', (req, res) => {
		return res.redirect(getLoginRedirectURL(req.query.state, conf.fetchOrganizations));
	});
	app.get('/done', async (req, res) => {
		let device = require('ocore/device.js');
		let query = req.query;
		console.error('received request', query);
		if (!query.code || !query.state)
			return res.render('done.ejs', {
				'message': texts.invalidSessionParams()
			});
		let rows = await db.query("SELECT device_address, user_address FROM users WHERE unique_id=?", [query.state]);
		if (rows.length === 0)
			return res.render('done.ejs', {
				'message': texts.expiredSessionParams()
			});
		let userInfo = rows[0];
		if (!userInfo.user_address){
			device.sendMessageToDevice(userInfo.device_address, 'text', texts.insertMyAddress());
			return res.render('done.ejs', {
				'message': texts.returnChatInsertAddressAgain()
			});
		}
		let requestWithAuth;
		let meResult;
		try {
			const { token } = await auth({
				type: "token",
				code: query.code,
				state: query.state,
			});
			requestWithAuth = util.promisify(
				request.defaults({
					baseUrl: 'https://api.github.com',
					json: true,
					headers: {
						'User-Agent': conf.program +' '+ conf.program_version,
						'Authorization': 'token '+ token,
					},
				})
			);
			meResult = await requestWithAuth("/user");
		}
		catch (err) {
			console.error(err);
			return res.render('done.ejs', {
				'message': texts.failedAuthentication()
			});
		}
		let attest_options = [{
			node_id: meResult.body.node_id,
			login: meResult.body.login,
			type: meResult.body.type
		}];
		if (conf.fetchOrganizations) {
			try {
				const orgsResult = await requestWithAuth("/user/orgs");
				if (orgsResult.body && Array.isArray(orgsResult.body)) {
					orgsResult.body.forEach((item) => {
						attest_options.push({
							node_id: item.node_id,
							login: item.login,
							type: 'Organization'
						});
					});
				}
				//console.log(attest_options);
			}
			catch (err) {
				console.error(err);
				// ignore if fails to get organizations
			}
		}

		userInfo.github_id = meResult.body.node_id;
		userInfo.github_username = meResult.body.login;
		userInfo.github_options = attest_options;
		await db.query("UPDATE users SET github_id = ?, github_username = ?, github_options = ?, unique_id = ? WHERE device_address = ?", [
			userInfo.github_id,
			userInfo.github_username,
			JSON.stringify(attest_options),
			'', // reset once used
			userInfo.device_address
		]);
		readOrAssignReceivingAddress(userInfo, (receiving_address, post_publicly) => {
			let response = attestationOptions(userInfo) +'\n\n';
			let challenge = userInfo.github_username + ' ' + userInfo.user_address;
			if (post_publicly === null) {
				response += texts.privateOrPublic();
			}
			else {
				response += texts.pleasePay(receiving_address, conf.priceInBytes, userInfo.user_address, challenge) + '\n\n' +
					((post_publicly === 0) ? texts.privateChosen() : texts.publicChosen(userInfo.github_username));
			}
			device.sendMessageToDevice(userInfo.device_address, 'text', response);
		});
		res.render('done.ejs', {
			'message': '<font color="green">'+ texts.gotYourUsername() +'</font><br>' + texts.closeThisWindow()
		});
	});

	server.listen(conf.webPort, () => {
		console.log(`== server started listening on ${conf.webPort} port`);
	});
}

/**
 * user pairs his device with bot
 */
eventBus.on('paired', (from_address, pairing_secret) => {
	respond(from_address, '', texts.greeting());
});

/**
 * user sends message to the bot
 */
const headlessWallet = require('headless-obyte');
eventBus.on('text', (from_address, text) => {
	respond(from_address, text.trim());
});
if (conf.bRunWitness) {
	require('obyte-witness');
	eventBus.emit('headless_wallet_ready');
} else {
	headlessWallet.setupChatEventHandlers();
}

/**
 * user pays to the bot
 */
eventBus.on('new_my_transactions', handleNewTransactions);

/**
 * payment is confirmed
 */
if (!conf.bAcceptUnconfirmedPayments)
	eventBus.on('my_transactions_became_stable', handleTransactionsBecameStable);

/**
 * ready headless wallet
 */
eventBus.once('headless_wallet_ready', handleWalletReady);

function handleWalletReady() {
	let error = '';

	/**
	 * check if database tables are created
	 */
	let arrTableNames = [
		'users','receiving_addresses','transactions','attestation_units', 'accepted_payments','rejected_payments', 'signed_messages'
	];
	db.query("SELECT name FROM sqlite_master WHERE type='table' AND NAME IN (?)", [arrTableNames], (rows) => {
		if (rows.length !== arrTableNames.length) {
			error += texts.errorInitSql();
		}

		/**
		 * check if config is filled correct
		 */
		if (!conf.admin_email || !conf.from_email) {
			error += texts.errorConfigEmail();
		}
		if (!conf.salt) {
			error += texts.errorConfigSalt();
		}

		if (error) {
			throw new Error(error);
		}

		const headlessWallet = require('headless-obyte');
		headlessWallet.issueOrSelectAddressByIndex(0, 0, (address1) => {
			console.log('== github attestation address: ' + address1);
			githubAttestation.githubAttestorAddress = address1;

			setInterval(githubAttestation.retryPostingAttestations, 60*1000);
			setInterval(moveFundsToAttestorAddresses, 60*1000);
			
			const consolidation = require('headless-obyte/consolidation.js');
			consolidation.scheduleConsolidation(githubAttestation.githubAttestorAddress, headlessWallet.signer, 100, 3600*1000);
			
			startWebServer();
		});
	});
}

function moveFundsToAttestorAddresses() {
	let network = require('ocore/network.js');
	const mutex = require('ocore/mutex.js');
	if (network.isCatchingUp())
		return;

	mutex.lock(['moveFundsToAttestorAddresses'], unlock => {
		console.log('moveFundsToAttestorAddresses');
		db.query(
			`SELECT * FROM (
				SELECT DISTINCT receiving_address
				FROM receiving_addresses 
				CROSS JOIN outputs ON receiving_address = address 
				JOIN units USING(unit)
				WHERE is_stable=1 AND is_spent=0 AND asset IS NULL
			) AS t
			WHERE NOT EXISTS (
				SELECT * FROM units CROSS JOIN unit_authors USING(unit)
				WHERE is_stable=0 AND unit_authors.address=t.receiving_address AND definition_chash IS NOT NULL
			)
			LIMIT ?`,
			[constants.MAX_AUTHORS_PER_UNIT],
			(rows) => {
				// console.error('moveFundsToAttestorAddresses', rows);
				if (rows.length === 0) {
					return unlock();
				}

				let arrAddresses = rows.map(row => row.receiving_address);
				// console.error(arrAddresses, githubAttestation.githubAttestorAddress);
				let headlessWallet = require('headless-obyte');
				headlessWallet.sendMultiPayment({
					asset: null,
					to_address: githubAttestation.githubAttestorAddress,
					send_all: true,
					paying_addresses: arrAddresses
				}, (err, unit) => {
					if (err) {
						console.error("failed to move funds: " + err);
						let balances = require('ocore/balances');
						balances.readBalance(arrAddresses[0], (balance) => {
							console.error('balance', balance);
							notifications.notifyAdmin('failed to move funds', err + ", balance: " + JSON.stringify(balance));
							unlock();
						});
					}
					else{
						console.log("moved funds, unit " + unit);
						unlock();
					}
				});
			}
		);
	});
}


function handleNewTransactions(arrUnits) {
	let device = require('ocore/device.js');
	db.query(
		`SELECT
			amount, asset, unit,
			receiving_address, device_address, user_address, github_id, github_username, price, 
			${db.getUnixTimestamp('last_price_date')} AS price_ts
		FROM outputs
		CROSS JOIN receiving_addresses ON receiving_addresses.receiving_address = outputs.address
		WHERE unit IN(?)
			AND NOT EXISTS (
				SELECT 1
				FROM unit_authors
				CROSS JOIN my_addresses USING(address)
				WHERE unit_authors.unit = outputs.unit
			)`,
		[arrUnits],
		(rows) => {
			rows.forEach((row) => {

				checkPayment(row, (error) => {
					if (error) {
						return db.query(
							`INSERT ${db.getIgnore()} INTO rejected_payments
							(receiving_address, price, received_amount, payment_unit, error)
							VALUES (?,?,?,?,?)`,
							[row.receiving_address, row.price, row.amount, row.unit, error],
							() => {
								device.sendMessageToDevice(row.device_address, 'text', error);
							}
						);
					}

					db.query(`INSERT INTO transactions (receiving_address, proof_type) VALUES (?, 'payment')`, [row.receiving_address], (res) => {
						let transaction_id = res.insertId;
						db.query(
							`INSERT INTO accepted_payments
							(transaction_id, receiving_address, price, received_amount, payment_unit)
							VALUES (?,?,?,?,?)`,
							[transaction_id, row.receiving_address, row.price, row.amount, row.unit],
							() => {
								if (conf.bAcceptUnconfirmedPayments){
									device.sendMessageToDevice(row.device_address, 'text', texts.receivedAndAcceptedYourPayment(row.amount));
									handleTransactionsBecameStable([row.unit]);
								}
								else
									device.sendMessageToDevice(row.device_address, 'text', texts.receivedYourPayment(row.amount));
							}
						);
					});

				}); // checkPayment

			});
		}
	);
}

function checkPayment(row, onDone) {
	if (row.asset !== null) {
		return onDone("Received payment in wrong asset");
	}

	if (row.amount < conf.priceInBytes) {
		let text = `Received ${row.amount} Bytes from you, which is less than the expected ${conf.priceInBytes} Bytes.`;
		let challenge = row.github_username + ' ' + row.user_address;
		return onDone(text + '\n\n' + texts.pleasePay(row.receiving_address, conf.priceInBytes, row.user_address, challenge));
	}

	function resetUserAddress(){
		db.query("UPDATE users SET user_address=NULL WHERE device_address=?", [row.device_address]);
	}
	
	db.query("SELECT address FROM unit_authors WHERE unit=?", [row.unit], (author_rows) => {
		if (author_rows.length !== 1){
			resetUserAddress();
			return onDone("Received a payment but looks like it was not sent from a single-address wallet. "+texts.switchToSingleAddress());
		}
		if (author_rows[0].address !== row.user_address){
			resetUserAddress();
			return onDone("Received a payment but it was not sent from the expected address "+row.user_address+". "+texts.switchToSingleAddress());
		}
		onDone();
	});
}

function handleTransactionsBecameStable(arrUnits) {
	let device = require('ocore/device.js');
	db.query(
		`SELECT transaction_id, device_address, user_address, github_id, github_username, post_publicly, payment_unit
		FROM accepted_payments
		JOIN receiving_addresses USING(receiving_address)
		WHERE payment_unit IN(?)`,
		[arrUnits],
		(rows) => {
			rows.forEach((row) => {
				db.query(
					`UPDATE accepted_payments SET confirmation_date=${db.getNow()}, is_confirmed=1 WHERE transaction_id=?`,
					[row.transaction_id],
					() => {
						if (!conf.bAcceptUnconfirmedPayments)
							device.sendMessageToDevice(row.device_address, 'text', texts.paymentIsConfirmed());
						attest(row, 'payment');
					}
				);
			}); // forEach
		}
	);
}


function attest(row, proof_type){
	const mutex = require('ocore/mutex.js');
	let transaction_id = row.transaction_id;
	mutex.lock(['tx-'+transaction_id], unlock => {
		db.query(
			`INSERT ${db.getIgnore()} INTO attestation_units (transaction_id) VALUES (?)`,
			[transaction_id],
			() => {

				let	[attestation, src_profile] = githubAttestation.getAttestationPayloadAndSrcProfile(
					row.user_address,
					row.github_id,
					row.github_username,
					row.post_publicly
				);

				githubAttestation.postAndWriteAttestation(
					transaction_id,
					githubAttestation.githubAttestorAddress,
					attestation,
					src_profile,
					function(err, attestation_unit) {
						if (err) console.error(err);
					}
				);
				return unlock();
			}
		);
	});
}


/**
 * scenario for responding to user requests
 * @param from_address
 * @param text
 * @param response
 */
function respond(from_address, text, response = '') {
	let device = require('ocore/device.js');
	const mutex = require('ocore/mutex.js');
	readUserInfo(from_address, (userInfo) => {

		function checkUserAddress(onDone) {
			if (validationUtils.isValidAddress(text)) {
				userInfo.user_address = text;
				userInfo.github_id = null;
				userInfo.github_username = null;
				response += texts.goingToAttestAddress(userInfo.user_address);
				return db.query(
					'UPDATE users SET user_address=? WHERE device_address=?',
					[userInfo.user_address, from_address],
					() => {
						onDone();
					}
				);
			}
			if (userInfo.user_address)
				return onDone();
			onDone(texts.insertMyAddress());
		}

		async function checkUsername(onDone) {
			if (userInfo.github_username) {
				let commands = text.split(' ');
				if (commands.length > 1 && commands[0] === 'choose') {
					for (var i = 0; i < userInfo.github_options.length; i++) {
						let option = userInfo.github_options[i];
						if (option.login === commands[1]) {
							userInfo.github_id = option.node_id;
							userInfo.github_username = option.login;
							await db.query("UPDATE users SET github_id = ?, github_username = ? WHERE device_address = ?", [
								userInfo.github_id,
								userInfo.github_username,
								userInfo.device_address
							]);
							break;
						}
					}
				}
				return onDone();
			}
			let link = getLoginURL(userInfo.unique_id);
			onDone(texts.proveUsername(link));
		}

		checkUserAddress((userAddressResponse) => {
			if (userAddressResponse)
				return device.sendMessageToDevice(from_address, 'text', (response ? response + '\n\n' : '') + userAddressResponse);

			if (text === 'again') {
				let link = getLoginURL(userInfo.unique_id);
				return device.sendMessageToDevice( from_address, 'text', (response ? response + '\n\n' : '') + texts.proveUsername(link) );
			}

			checkUsername((usernameResponse) => {
				if (usernameResponse)
					return device.sendMessageToDevice(from_address, 'text', (response ? response + '\n\n' : '') + usernameResponse);

				readOrAssignReceivingAddress(userInfo, async (receiving_address, post_publicly) => {
					let price = conf.priceInBytes;

					if (text === 'private' || text === 'public') {
						post_publicly = (text === 'public') ? 1 : 0;
						db.query(
							`UPDATE receiving_addresses 
							SET post_publicly=? 
							WHERE device_address=? AND user_address=? AND github_id=?`,
							[post_publicly, from_address, userInfo.user_address, userInfo.github_id]
						);
						response += (text === "private") ? texts.privateChosen() : texts.publicChosen(userInfo.github_username);
					}
					else {
						response += attestationOptions(userInfo);
					}

					if (post_publicly === null)
						return device.sendMessageToDevice(from_address, 'text', (response ? response + '\n\n' : '') + texts.privateOrPublic());

					let challenge = userInfo.github_username + ' ' + userInfo.user_address;

					// handle signed message
					let arrSignedMessageMatches = text.match(/\(signed-message:(.+?)\)/);
					if (arrSignedMessageMatches){
						let signedMessageBase64 = arrSignedMessageMatches[1];
						var validation = require('ocore/validation.js');
						var signedMessageJson = Buffer.from(signedMessageBase64, 'base64').toString('utf8');
						//console.error(signedMessageJson);
						try{
							var objSignedMessage = JSON.parse(signedMessageJson);
						}
						catch(e){
							return null;
						}
						validation.validateSignedMessage(objSignedMessage, async (err) => {
							if (err)
								return device.sendMessageToDevice(from_address, 'text', err);
							if (objSignedMessage.signed_message !== challenge)
								return device.sendMessageToDevice(from_address, 'text', "You signed a wrong message: "+objSignedMessage.signed_message+", expected: "+challenge);
							if (objSignedMessage.authors[0].address !== userInfo.user_address)
								return device.sendMessageToDevice(from_address, 'text', "You signed the message with a wrong address: "+objSignedMessage.authors[0].address+", expected: "+userInfo.user_address);

							let signed = await db.query("SELECT 1 FROM signed_messages WHERE user_address=? AND github_username=? AND creation_date>"+db.addTime('-1 DAY'), [userInfo.user_address, userInfo.github_username]);
							if (signed.length > 0)
								return device.sendMessageToDevice(from_address, 'text', "You are already attested.");

							let res = await db.query(`INSERT INTO transactions (receiving_address, proof_type) VALUES (?, 'signature')`, [receiving_address]);
							let transaction_id = res.insertId;

							await db.query(`INSERT INTO signed_messages (transaction_id, user_address, github_username, signed_message) VALUES (?,?,?,?)`, [transaction_id, userInfo.user_address, userInfo.github_username, signedMessageJson]);

							let rows = await db.query(`SELECT device_address, user_address, github_id, github_username, post_publicly FROM receiving_addresses WHERE receiving_address=?`, [receiving_address]);
							let row = rows[0];
							if (!row)
								throw Error("no receiving address "+receiving_address);
							row.transaction_id = transaction_id;
							attest(row, 'signature');
						});
						return;
					}
					
					let rows = await db.query(
						`SELECT transaction_id, is_confirmed, received_amount, user_address, github_id, github_username, attestation_date
						FROM accepted_payments
						JOIN receiving_addresses USING(receiving_address)
						LEFT JOIN attestation_units USING(transaction_id)
						WHERE receiving_address=?
						ORDER BY transaction_id DESC
						LIMIT 1`, [receiving_address]
					);

					/**
					 * if user didn't pay yet
					 */
					if (rows.length === 0) {
						return device.sendMessageToDevice(
							from_address,
							'text',
							(response ? response + '\n\n' : '') + 
								texts.pleasePayOrPrivacy(receiving_address, price, userInfo.user_address, challenge, post_publicly)
						);
					}

					let row = rows[0];
					let transaction_id = row.transaction_id;

					/**
					 * if user paid, but transaction did not become stable
					 */
					if (row.is_confirmed === 0) {
						return device.sendMessageToDevice(
							from_address,
							'text',
							(response ? response + '\n\n' : '') + texts.receivedYourPayment(row.received_amount)
						);
					}

					if (text === 'private' || text === 'public')
						return device.sendMessageToDevice(from_address, 'text', response);
					
					device.sendMessageToDevice(from_address, 'text', (response ? response + '\n\n' : '') + texts.alreadyAttested(row.attestation_date));

				});
			});
		});
	});
}

/**
 * options for username attestations
 * @param userInfo
 */
function attestationOptions(userInfo) {
	let response = '';
	userInfo.github_options.forEach(option => {
		response += option.login == userInfo.github_username ? '' : '\n* ['+ option.login + '](command:choose '+ option.login + ') ('+ option.type +')';
	});
	if (response) {
		response = '\n\n' + texts.otherOptions(response);
	}
	return texts.goingToAttestUsername(userInfo.github_username) + response;
}

/**
 * get user's information by device address
 * or create new user, if it's new device address
 * @param device_address
 * @param callback
 */
async function readUserInfo(device_address, callback) {
	let unique_id = crypto.randomBytes(16).toString("hex"); // 32 chars
	let rows = await db.query(`SELECT * FROM users WHERE device_address = ?;`, [device_address]);
	if (rows.length) {
		let userInfo = rows[0];
		userInfo.github_options = userInfo.github_options ? JSON.parse(userInfo.github_options) : [];
		if (!userInfo.unique_id) {
			userInfo.unique_id = unique_id; // add new unqiue when previously reset
			await db.query(`UPDATE users SET unique_id = ? WHERE device_address = ?;`, [userInfo.unique_id, device_address]);
		}
		callback(userInfo);
	}
	else {
		await db.query(`INSERT ${db.getIgnore()} INTO users (device_address, unique_id, github_options) VALUES(?,?,?);`, [device_address, unique_id, '']);
		callback({unique_id, device_address});
	}
}

/**
 * read or assign receiving address
 * @param device_address
 * @param userInfo
 * @param callback
 */
function readOrAssignReceivingAddress(userInfo, callback) {
	const mutex = require('ocore/mutex.js');
	mutex.lock([userInfo.device_address], (unlock) => {
		db.query(
			`SELECT receiving_address, post_publicly, ${db.getUnixTimestamp('last_price_date')} AS price_ts
			FROM receiving_addresses 
			WHERE device_address=? AND user_address=? AND github_id=?`,
			[userInfo.device_address, userInfo.user_address, userInfo.github_id],
			(rows) => {
				if (rows.length > 0) {
					let row = rows[0];
					callback(row.receiving_address, row.post_publicly);
					return unlock();
				}

				const headlessWallet = require('headless-obyte');
				headlessWallet.issueNextMainAddress((receiving_address) => {
					db.query(
						`INSERT INTO receiving_addresses 
						(device_address, user_address, github_id, github_username, receiving_address, price, last_price_date) 
						VALUES(?, ?, ?, ?, ?, ?, ${db.getNow()})`,
						[userInfo.device_address, userInfo.user_address, userInfo.github_id, userInfo.github_username, receiving_address, conf.priceInBytes],
						() => {
							callback(receiving_address, null);
							unlock();
						}
					);
				});
			}
		);
	});
}

process.on('unhandledRejection', up => { throw up; });

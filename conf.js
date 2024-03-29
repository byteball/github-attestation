/*jslint node: true */
"use strict";
exports.port = null;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = false;

exports.storage = 'sqlite';

// TOR is recommended. If you don't run TOR, please comment the next two lines
// exports.socksHost = '127.0.0.1';
// exports.socksPort = 9050;

exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'Github attestation bot';
exports.permanent_pairing_secret = '*';
exports.control_addresses = [''];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';

exports.bIgnoreUnpairRequests = true;
exports.bSingleAddress = false;
exports.bStaticChangeAddress = true;
exports.KEYS_FILENAME = 'keys.json';

// smtp https://github.com/byteball/ocore/blob/master/mail.js
exports.smtpTransport = 'local'; // use 'local' for Unix Sendmail
exports.smtpRelay = '';
exports.smtpUser = '';
exports.smtpPassword = '';
exports.smtpSsl = null;
exports.smtpPort = null;

// email setup
exports.admin_email = '';
exports.from_email = '';

// witnessing
exports.bRunWitness = false;
exports.THRESHOLD_DISTANCE = 20;
exports.MIN_AVAILABLE_WITNESSINGS = 100;

exports.priceInBytes = 49000;
exports.bAllowProofByPayment = false;
exports.bAcceptUnconfirmedPayments = true;
exports.fetchOrganizations = true;
exports.attestation_aa = process.env.testnet ? 'HZENJOEOLEBRGKQYJBGGIJNLX7RAAVSH' : 'NPTNZFOTBQ7DVTR4OVV7SEMBNYFP2ZZS';

exports.site = 'https://devid.org';

// Github
exports.GithubClientId = '';
exports.GithubClientSecret = '';

exports.webPort = 8080;

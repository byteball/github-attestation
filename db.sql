CREATE TABLE users (
	device_address CHAR(33) NOT NULL PRIMARY KEY,
	unique_id CHAR(32) NOT NULL UNIQUE,
	user_address CHAR(32) NULL,
	github_id VARCHAR(36) NULL,
	github_username VARCHAR(40) NULL,
	github_options TEXT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (device_address) REFERENCES correspondent_devices(device_address)
);
-- query separator
CREATE TABLE receiving_addresses (
	receiving_address CHAR(32) NOT NULL PRIMARY KEY,
	device_address CHAR(33) NOT NULL,
	user_address CHAR(32) NOT NULL,
	github_id VARCHAR(36) NOT NULL,
	github_username VARCHAR(40) NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	post_publicly TINYINT NULL,
	price INT NULL,
	last_price_date TIMESTAMP NULL,
	UNIQUE (device_address, user_address, github_id),
	FOREIGN KEY (device_address) REFERENCES correspondent_devices(device_address),
	FOREIGN KEY (receiving_address) REFERENCES my_addresses(address)
);
-- query separator
CREATE INDEX byReceivingAddress ON receiving_addresses(receiving_address);
-- query separator
CREATE INDEX ra_byUserAddress ON receiving_addresses(user_address);
-- query separator
CREATE INDEX byGithubId ON receiving_addresses(github_id);
-- query separator
CREATE TABLE transactions (
	transaction_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	receiving_address CHAR(32) NOT NULL,
	proof_type VARCHAR(10) CHECK (proof_type IN('payment', 'signature')) NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (receiving_address) REFERENCES receiving_addresses(receiving_address)
);
-- query separator
CREATE TABLE accepted_payments (
	transaction_id INTEGER NOT NULL PRIMARY KEY,
	receiving_address CHAR(32) NOT NULL,
	price INT NOT NULL,
	received_amount INT NOT NULL,
	payment_unit CHAR(44) NOT NULL UNIQUE,
	payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	is_confirmed INT NOT NULL DEFAULT 0,
	confirmation_date TIMESTAMP NULL,
	FOREIGN KEY (receiving_address) REFERENCES receiving_addresses(receiving_address),
	FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
	-- FOREIGN KEY (payment_unit) REFERENCES units(unit) ON DELETE CASCADE
);
-- query separator
CREATE TABLE rejected_payments (
	rejected_payment_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	receiving_address CHAR(32) NOT NULL,
	price INT NOT NULL,
	received_amount INT NOT NULL,
	payment_unit CHAR(44) NOT NULL UNIQUE,
	payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	error TEXT NOT NULL,
	FOREIGN KEY (receiving_address) REFERENCES receiving_addresses(receiving_address)
	-- FOREIGN KEY (payment_unit) REFERENCES units(unit) ON DELETE CASCADE
);
-- query separator
CREATE TABLE signed_messages (
	transaction_id INTEGER NOT NULL PRIMARY KEY,
	user_address CHAR(32) NOT NULL,
	github_username VARCHAR(40) NOT NULL,
	signed_message TEXT NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
);
-- query separator
CREATE INDEX sm_byUserAddress ON signed_messages(user_address);
-- query separator
CREATE INDEX sm_byGithubUsername ON signed_messages(github_username);
-- query separator
CREATE TABLE attestation_units (
	transaction_id INTEGER NOT NULL,
	attestation_unit CHAR(44) NULL UNIQUE,
	attestation_date TIMESTAMP NULL,
	PRIMARY KEY (transaction_id),
	FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
	FOREIGN KEY (attestation_unit) REFERENCES units(unit)
);

/**
 * Memory Storage Object, mapping strings to anything
 * @typedef {Object} MSO
 * @property {Function} DEL Deletes a key in the MSO
 * @property {Function} EXISTS Determines whether a key exists in the MSO
 * @property {Function} EXPIRE Changes the expiration for a specific key
 * @property {Function} GET Lookups the value for a given key
 * @property {Function} SET Sets the corresponding value for a key
 */
/**
 * @param {object} [config] The configuration to use
 * @param {number} [config.time=0] The default time for expiration
 * @return {MSO} The Memory Storage Object for the given module
 */
module.exports = (config) => {
    if ( config == undefined ) {
		config = {};
    }
    let data = {
		time: config.time || 0
    };
    const __timeout = (key) => {
		return ()=>{
		    //console.log ( `Deleting ${key}` );
		    delete data[key];
		    //console.log ( data );
		}
	};

	/**
	 * Returns the value corresponding to the key
	 * @param {string} key The key to lookup
	 * @return {any} The value corresponding to that key
	 */
    const GET = (key) => {
		if ( data.hasOwnProperty(key) ) {
			return data[key].value;
		} else {
			return undefined;
		}
	};

	/**
	 * Checks whether a key exists
	 * @param {string} key The key to check
	 * @return {boolean} Whether the key is currently tracked
	 */
    const EXISTS = ( key ) => {
		return data.hasOwnProperty(key);
	};

	/**
	 * Sets a key, optionally using a different timeout that the default
	 * @param {string} key The key to set the value for (may already exist)
	 * @param {any} value The value for the given key
	 * @param {number} [timeout=data.time] The amount of time (in ms) this key will persist
	 */
    const SET = ( key, value, timeout=data.time ) => {
		if ( data.hasOwnProperty(key) ) {
			clearTimeout(data[key].handler);
		}
		let handler = timeout == 0 ? undefined : setTimeout(__timeout(key), timeout);
		data[key] = {value, handler};
	};

	/**
	 * Removes a key from the MSO
	 * @param {string} key The key to delete, does not need to exist
	 * @return {any} The value stored at the given key (or undefined if it doesn't exist)
	 */
    const DEL = ( key ) => {
		let ret = undefined;
		if ( data.hasOwnProperty(key) ) {
			clearTimeout(data[key].handler);
			ret = data[key].value;
		}
		delete data[key];
		return ret;
	};
	
	/**
	 * Updates the expiration for a given key
	 * @param {string} key The key to attach an expiration to
	 * @param {number} [timeout=data.time] The time to update the expiration to (defaults to the config default)
	 * @return {boolean} Whether the timeout was updated (fails if key doesn't exist)
	 */
    const EXPIRE = ( key, timeout=data.time ) => {
		if ( !data.hasOwnProperty(key) ) {
			return false;
		}
		clearTimeout(data[key].handler);
		let handler = timeout == 0 ? undefined : setTimeout(__timeout(key), timeout);
		data[key].handler = handler;
		return true;
    };
    return {DEL, EXISTS, EXPIRE, GET, SET};
}

import _ from 'lodash';

import HttpProvider from './httpprovider';
import Formatter from './formatter';
import Utils from './utils.js';
import Encoder from './encoder';

const SEND_AMOUNT = 0;
const SEND_GASLIMIT = 250000;
const SEND_GASPRICE = 0.0000004;

const MAX_BYTES_PER_ARRAY_SLOT = 64;

const REGEX_BYTES = /bytes([0-9]+)/;
const REGEX_BYTES_ARRAY = /bytes([0-9]+)(\[[0-9]+\])/;
const REGEX_NUMBER = /[0-9]+/g;
const REGEX_DYNAMIC_ARRAY = /\[\]/;

class Contract {
  constructor(url, address, abi) {
    this.provider = new HttpProvider(url);
    this.address = Utils.trimHexPrefix(address);
    this.abi = abi;
  }

  /**
   * @dev Executes a callcontract on a view/pure method via the qtum-cli.
   * @param {string} methodName Name of contract method
   * @param {array} params Parameters of contract method
   * @return {Promise} Promise containing result object or Error
   */
  call(methodName, params) {
    const { methodArgs, senderAddress } = params;
    const { method: methodObj, args } = this.validateMethodAndArgs(methodName, methodArgs);

    const options = {
      method: 'callcontract',
      params: [
        this.address,
        this.constructDataHex(methodObj, args),
        senderAddress,
      ],
    };

    return this.provider.request(options)
      .then((result) => Formatter.callOutput(result, this.abi, methodName, true));
  }

  /*
  * @dev Executes a sendtocontract on this contract via the qtum-cli.
  * @param methodName Method name to execute as a string.
  * @param params Parameters of the contract method.
  * @return The transaction id of the sendtocontract.
  */
  send(methodName, params) {
    // Throw if methodArgs or senderAddress is not defined in params
    Utils.paramsCheck('send', params, ['methodArgs', 'senderAddress']);

    const { methodArgs, amount, gasLimit, gasPrice, senderAddress } = params;
    const { method: methodObj, args } = this.validateMethodAndArgs(methodName, methodArgs);
    const options = {
      method: 'sendtocontract',
      params: [
        this.address,
        this.constructDataHex(methodObj, args),
        amount || SEND_AMOUNT,
        gasLimit || SEND_GASLIMIT,
        gasPrice || SEND_GASPRICE,
        senderAddress,
      ],
    };

    return this.provider.request(options);
  }

  /*
  * @dev Constructs the data hex string needed for a call() or send().
  * @param methodObj The json object of the method taken from the ABI.
  * @param args The arguments for the method.
  * @return The full hex string concatenated together.
  */
  constructDataHex(methodObj, args) {
    if (!methodObj) {
      throw new Error(`methodObj should not be undefined.`);
    }

    let dataHex = '';
    dataHex = dataHex.concat(Encoder.getFunctionHash(methodObj));

    let hex;
    _.each(methodObj.inputs, (item, index) => {
      const type = item.type;

      if (type === 'address') {
        hex = Encoder.addressToHex(args[index]);
        dataHex = dataHex.concat(hex);
      } else if (type === 'bool') {
        hex = Encoder.boolToHex(args[index]);
        dataHex = dataHex.concat(hex);
      } else if (type.startsWith('uint')) {
        hex = Encoder.uintToHex(args[index]);
        dataHex = dataHex.concat(hex);
      } else if (type.startsWith('int')) {
        hex = Encoder.intToHex(args[index]);
        dataHex = dataHex.concat(hex);
      } else if (type.match(REGEX_BYTES)) {
        if (type.match(REGEX_BYTES_ARRAY)) { // fixed bytes array, ie. bytes32[10]
          const arrCapacity = _.toNumber(type.match(REGEX_NUMBER)[1]);

          if (args[index] instanceof Array) {
            hex = Encoder.stringArrayToHex(args[index], arrCapacity);
            dataHex = dataHex.concat(hex);
          } else {
            hex = Encoder.stringToHex(args[index], MAX_BYTES_PER_ARRAY_SLOT * arrCapacity);
            dataHex = dataHex.concat(hex);
          }
        } else { // fixed bytes, ie. bytes32
          hex = Encoder.stringToHex(args[index], MAX_BYTES_PER_ARRAY_SLOT);
          dataHex = dataHex.concat(hex);
        } 
      } else if (type === 'bytes') {
        console.error('dynamics bytes conversion not implemented.');
      } else if (type === 'string') {
        console.error('dynamic string conversion not implemented.');
      } else if (type.match(REGEX_DYNAMIC_ARRAY)) {
        console.error('dynamic array conversion not implemented.');
      }
    });

    return dataHex;
  }

  /**
   * Validates arguments by ABI schema and throws errors if mismatch.
   * @param {String} methodName The method name.
   * @param {Array} methodArgs The method arguments.
   * @return {Object} The method object in ABI and processed argument array.
   */
  validateMethodAndArgs(methodName, methodArgs) {
    const methodObj = _.find(this.abi, { name: methodName });

    if (_.isUndefined(methodObj)) {
      throw new Error(`Method ${methodName} not defined in ABI.`);
    }
    if (methodObj.inputs.length != methodArgs.length) {
      throw new Error(`Number of arguments supplied does not match ABI method args.`);
    }

    let args;
    if (_.isUndefined(methodArgs)) {
      args = [];
    } else if (_.isArray(methodArgs)) {
      args = methodArgs;
    } else {
      args = [methodArgs];
    }

    return {
      method: methodObj,
      args,
    };
  }
}

module.exports = Contract;

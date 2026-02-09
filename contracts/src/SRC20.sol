// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.13;

interface ISRC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function balanceOf() external view returns (uint256);
    function approve(address spender, suint256 amount) external returns (bool);
    function transfer(address to, suint256 amount) external returns (bool);
    function transferFrom(address from, address to, suint256 amount) external returns (bool);
}

/// @notice Confidential ERC20 with suint256 storage for Seismic network.
abstract contract SRC20 is ISRC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    suint256 internal totalSupply;
    mapping(address => suint256) internal balance;
    mapping(address => mapping(address => suint256)) internal allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function balanceOf() external view returns (uint256) {
        return uint256(balance[msg.sender]);
    }

    function approve(address spender, suint256 amount) public virtual returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, suint256 amount) public virtual returns (bool) {
        balance[msg.sender] -= amount;
        unchecked {
            balance[to] += amount;
        }
        return true;
    }

    function transferFrom(address from, address to, suint256 amount) public virtual returns (bool) {
        suint256 allowed = allowance[from][msg.sender];
        if (allowed != suint256(type(uint256).max)) {
            allowance[from][msg.sender] = allowed - amount;
        }

        balance[from] -= amount;
        unchecked {
            balance[to] += amount;
        }
        return true;
    }

    function _totalSupply() internal view returns (uint256) {
        return uint256(totalSupply);
    }

    function _mint(address to, suint256 amount) internal virtual {
        totalSupply += amount;
        unchecked {
            balance[to] += amount;
        }
    }

    function _burn(address from, suint256 amount) internal virtual {
        balance[from] -= amount;
        unchecked {
            totalSupply -= amount;
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Holder revenue share for $creations: a cumulative Merkle distributor.
//
// Each month the studio works out, off-chain, what every holder has earned in total since the start (see
// scripts/revshare-epoch.mjs) and publishes the Merkle root of the new running totals. Publishing pulls that month's
// pool straight from the $creations treasury wallet, which approves this contract once. A holder claims whenever they like: the contract pays the difference between their
// running total and what they have already claimed, so nothing expires and missed months simply add up.
//
// Holders never lock or deposit anything. Their tokens stay in their own wallet the whole time.
//
// Trust model, in plain terms:
//   - the owner can only ADD to what is owed (totals never go down), and every root is fully funded when it is
//     published: the shortfall is pulled from the treasury in the same transaction, or the publish reverts;
//   - funds only ever come from the treasury, and only as much as the new root allocates;
//   - there is no withdraw: tokens sent here can only ever leave through claims;
//   - the owner decides who is owed what. That is checked in public instead: the full list of running totals is
//     published next to the root (public/revshare/tree.json), so anyone can rebuild the root and compare.
//
// Leaves use the same encoding as OpenZeppelin's StandardMerkleTree with types ['address', 'uint256']:
//   leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulativeAmount))))
// and pairs are hashed in sorted order.

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract RevenueShare {
    IERC20 public immutable token;
    address public immutable treasury; // where every payout comes from
    address public owner;

    bytes32 public merkleRoot;
    uint256 public epoch;            // how many roots have been published
    uint256 public totalAllocated;   // sum of every holder's running total in the current root
    uint256 public totalClaimed;     // sum of everything paid out so far
    mapping(address => uint256) public claimed;

    event Published(uint256 indexed epoch, bytes32 merkleRoot, uint256 totalAllocated, uint256 pulledFromTreasury);
    event Claimed(address indexed account, uint256 amount, uint256 cumulativeAmount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddress();
    error TotalWentDown();
    error NotFunded(uint256 needed, uint256 available);
    error InvalidProof();
    error NothingToClaim();
    error TransferFailed();

    constructor(IERC20 token_, address treasury_, address owner_) {
        if (address(token_) == address(0) || treasury_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        token = token_;
        treasury = treasury_;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // Publish the running totals after a month closes. Whatever the contract is short of paying everything owed and
    // not yet claimed is pulled from the treasury here, so the treasury must have approved at least that much.
    function publish(bytes32 root, uint256 newTotalAllocated) external onlyOwner {
        if (newTotalAllocated < totalAllocated) revert TotalWentDown();

        uint256 held = token.balanceOf(address(this)) + totalClaimed;
        uint256 pulled = 0;
        if (held < newTotalAllocated) {
            pulled = newTotalAllocated - held;
            _safeTransferFrom(treasury, pulled);
        }
        uint256 available = token.balanceOf(address(this)) + totalClaimed;
        if (available < newTotalAllocated) revert NotFunded(newTotalAllocated, available);

        merkleRoot = root;
        totalAllocated = newTotalAllocated;
        epoch += 1;
        emit Published(epoch, root, newTotalAllocated, pulled);
    }

    // Pays `account` everything it is owed and has not claimed yet. Anyone may call it (a relayer, a friend paying
    // the gas), but the tokens always go to `account`.
    function claim(address account, uint256 cumulativeAmount, bytes32[] calldata proof) external {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulativeAmount))));
        if (!_verify(proof, merkleRoot, leaf)) revert InvalidProof();

        uint256 already = claimed[account];
        if (cumulativeAmount <= already) revert NothingToClaim();
        uint256 amount = cumulativeAmount - already;

        claimed[account] = cumulativeAmount;
        totalClaimed += amount;
        _safeTransfer(account, amount);
        emit Claimed(account, amount, cumulativeAmount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) private pure returns (bool) {
        bytes32 hash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            hash = hash < p ? keccak256(abi.encodePacked(hash, p)) : keccak256(abi.encodePacked(p, hash));
        }
        return hash == root;
    }

    // Both work with tokens that return nothing from transfer() as well as those that return a bool.
    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address from, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(token).call(abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}

#![allow(unexpected_cfgs)]
#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

declare_id!("8cdX9Sv53BddvaqdB9N1qTwPd1YBrhh8x1iAo9DBMUFE");

const BPS_DENOMINATOR: u128 = 10_000;
const MAX_LTV_BPS: u16 = 5_000;
const MAX_LIQUIDATION_LTV_BPS: u16 = 8_000;
const MAX_LIQUIDATION_BONUS_BPS: u16 = 1_500;
const MAX_CONFIDENCE_BPS: u16 = 1_000;
const MAX_PRICE_AGE_SECONDS: u64 = 300;

#[program]
pub mod solcage_lending {
    use super::*;

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.admin = ctx.accounts.admin.key();
        protocol.borrow_mint = ctx.accounts.borrow_mint.key();
        protocol.paused = false;
        protocol.bump = ctx.bumps.protocol;
        emit!(ProtocolInitialized {
            admin: protocol.admin,
            borrow_mint: protocol.borrow_mint,
        });
        Ok(())
    }

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        price_feed_id: [u8; 32],
        max_ltv_bps: u16,
        liquidation_ltv_bps: u16,
        liquidation_bonus_bps: u16,
        max_price_age_seconds: u64,
        max_confidence_bps: u16,
    ) -> Result<()> {
        require!(
            max_ltv_bps > 0 && max_ltv_bps <= MAX_LTV_BPS,
            LendingError::InvalidLtv
        );
        require!(
            liquidation_ltv_bps > max_ltv_bps && liquidation_ltv_bps <= MAX_LIQUIDATION_LTV_BPS,
            LendingError::InvalidLiquidationThreshold
        );
        require!(
            liquidation_bonus_bps <= MAX_LIQUIDATION_BONUS_BPS,
            LendingError::InvalidLiquidationBonus
        );
        require!(
            max_price_age_seconds > 0 && max_price_age_seconds <= MAX_PRICE_AGE_SECONDS,
            LendingError::InvalidOracleConfiguration
        );
        require!(
            max_confidence_bps > 0 && max_confidence_bps <= MAX_CONFIDENCE_BPS,
            LendingError::InvalidOracleConfiguration
        );
        require!(
            ctx.accounts.collateral_mint.key() != ctx.accounts.protocol.borrow_mint,
            LendingError::InvalidCollateralMint
        );

        let market = &mut ctx.accounts.market;
        market.protocol = ctx.accounts.protocol.key();
        market.collateral_mint = ctx.accounts.collateral_mint.key();
        market.price_feed_id = price_feed_id;
        market.max_ltv_bps = max_ltv_bps;
        market.liquidation_ltv_bps = liquidation_ltv_bps;
        market.liquidation_bonus_bps = liquidation_bonus_bps;
        market.max_price_age_seconds = max_price_age_seconds;
        market.max_confidence_bps = max_confidence_bps;
        market.enabled = false;
        market.total_collateral = 0;
        market.total_debt = 0;
        market.bump = ctx.bumps.market;

        emit!(MarketInitialized {
            market: market.key(),
            collateral_mint: market.collateral_mint,
            price_feed_id,
        });
        Ok(())
    }

    pub fn set_protocol_paused(ctx: Context<AdminProtocol>, paused: bool) -> Result<()> {
        ctx.accounts.protocol.paused = paused;
        emit!(ProtocolPauseChanged { paused });
        Ok(())
    }

    pub fn set_market_enabled(ctx: Context<AdminMarket>, enabled: bool) -> Result<()> {
        ctx.accounts.market.enabled = enabled;
        emit!(MarketStatusChanged {
            market: ctx.accounts.market.key(),
            enabled,
        });
        Ok(())
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, LendingError::InvalidAmount);
        require!(!ctx.accounts.protocol.paused, LendingError::ProtocolPaused);
        require!(ctx.accounts.market.enabled, LendingError::MarketDisabled);

        let position = &mut ctx.accounts.position;
        if position.owner == Pubkey::default() {
            position.owner = ctx.accounts.owner.key();
            position.market = ctx.accounts.market.key();
            position.collateral_amount = 0;
            position.debt_amount = 0;
            position.bump = ctx.bumps.position;
        }

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.owner_collateral_account.to_account_info(),
            mint: ctx.accounts.collateral_mint.to_account_info(),
            to: ctx.accounts.collateral_vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), transfer_accounts),
            amount,
            ctx.accounts.collateral_mint.decimals,
        )?;

        position.collateral_amount = position
            .collateral_amount
            .checked_add(amount)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_collateral = ctx
            .accounts
            .market
            .total_collateral
            .checked_add(amount)
            .ok_or(LendingError::MathOverflow)?;

        emit!(CollateralDeposited {
            owner: ctx.accounts.owner.key(),
            market: ctx.accounts.market.key(),
            amount,
            position_collateral: position.collateral_amount,
        });
        Ok(())
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(amount > 0, LendingError::InvalidAmount);
        require!(!ctx.accounts.protocol.paused, LendingError::ProtocolPaused);
        require!(ctx.accounts.market.enabled, LendingError::MarketDisabled);

        let price = validated_price(&ctx.accounts.market, &ctx.accounts.price_update)?;
        let collateral_value = collateral_to_borrow_units(
            ctx.accounts.position.collateral_amount,
            ctx.accounts.collateral_mint.decimals,
            price.price,
            price.exponent,
            ctx.accounts.borrow_mint.decimals,
        )?;
        let maximum_debt = bps_mul(collateral_value, ctx.accounts.market.max_ltv_bps)?;
        let new_debt = ctx
            .accounts
            .position
            .debt_amount
            .checked_add(amount)
            .ok_or(LendingError::MathOverflow)?;
        require!(
            new_debt <= maximum_debt,
            LendingError::InsufficientCollateral
        );
        require!(
            amount <= ctx.accounts.liquidity_vault.amount,
            LendingError::InsufficientLiquidity
        );

        let signer_seeds: &[&[&[u8]]] = &[&[b"protocol", &[ctx.accounts.protocol.bump]]];
        let transfer_accounts = TransferChecked {
            from: ctx.accounts.liquidity_vault.to_account_info(),
            mint: ctx.accounts.borrow_mint.to_account_info(),
            to: ctx.accounts.owner_borrow_account.to_account_info(),
            authority: ctx.accounts.protocol.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                transfer_accounts,
                signer_seeds,
            ),
            amount,
            ctx.accounts.borrow_mint.decimals,
        )?;

        ctx.accounts.position.debt_amount = new_debt;
        ctx.accounts.market.total_debt = ctx
            .accounts
            .market
            .total_debt
            .checked_add(amount)
            .ok_or(LendingError::MathOverflow)?;

        emit!(CreditBorrowed {
            owner: ctx.accounts.owner.key(),
            market: ctx.accounts.market.key(),
            amount,
            position_debt: new_debt,
        });
        Ok(())
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        require!(amount > 0, LendingError::InvalidAmount);
        require!(
            amount <= ctx.accounts.position.debt_amount,
            LendingError::RepayExceedsDebt
        );

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.owner_borrow_account.to_account_info(),
            mint: ctx.accounts.borrow_mint.to_account_info(),
            to: ctx.accounts.liquidity_vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), transfer_accounts),
            amount,
            ctx.accounts.borrow_mint.decimals,
        )?;

        ctx.accounts.position.debt_amount = ctx
            .accounts
            .position
            .debt_amount
            .checked_sub(amount)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_debt = ctx
            .accounts
            .market
            .total_debt
            .checked_sub(amount)
            .ok_or(LendingError::MathOverflow)?;

        emit!(CreditRepaid {
            owner: ctx.accounts.owner.key(),
            market: ctx.accounts.market.key(),
            amount,
            remaining_debt: ctx.accounts.position.debt_amount,
        });
        Ok(())
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, LendingError::InvalidAmount);
        require!(!ctx.accounts.protocol.paused, LendingError::ProtocolPaused);
        require!(
            ctx.accounts.position.debt_amount == 0,
            LendingError::OutstandingDebt
        );
        require!(
            amount <= ctx.accounts.position.collateral_amount,
            LendingError::InsufficientPositionCollateral
        );

        let collateral_key = ctx.accounts.collateral_mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"market",
            collateral_key.as_ref(),
            &[ctx.accounts.market.bump],
        ]];
        let transfer_accounts = TransferChecked {
            from: ctx.accounts.collateral_vault.to_account_info(),
            mint: ctx.accounts.collateral_mint.to_account_info(),
            to: ctx.accounts.owner_collateral_account.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                transfer_accounts,
                signer_seeds,
            ),
            amount,
            ctx.accounts.collateral_mint.decimals,
        )?;

        ctx.accounts.position.collateral_amount = ctx
            .accounts
            .position
            .collateral_amount
            .checked_sub(amount)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_collateral = ctx
            .accounts
            .market
            .total_collateral
            .checked_sub(amount)
            .ok_or(LendingError::MathOverflow)?;

        emit!(CollateralWithdrawn {
            owner: ctx.accounts.owner.key(),
            market: ctx.accounts.market.key(),
            amount,
            remaining_collateral: ctx.accounts.position.collateral_amount,
        });
        Ok(())
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        require!(ctx.accounts.position.debt_amount > 0, LendingError::NoDebt);
        let price = validated_price(&ctx.accounts.market, &ctx.accounts.price_update)?;
        let collateral_value = collateral_to_borrow_units(
            ctx.accounts.position.collateral_amount,
            ctx.accounts.collateral_mint.decimals,
            price.price,
            price.exponent,
            ctx.accounts.borrow_mint.decimals,
        )?;
        let liquidation_limit = bps_mul(collateral_value, ctx.accounts.market.liquidation_ltv_bps)?;
        require!(
            ctx.accounts.position.debt_amount > liquidation_limit,
            LendingError::PositionHealthy
        );

        let debt = ctx.accounts.position.debt_amount;
        let debt_with_bonus = bps_mul(
            debt,
            10_000u16
                .checked_add(ctx.accounts.market.liquidation_bonus_bps)
                .ok_or(LendingError::MathOverflow)?,
        )?;
        let requested_collateral = borrow_to_collateral_units(
            debt_with_bonus,
            ctx.accounts.collateral_mint.decimals,
            price.price,
            price.exponent,
            ctx.accounts.borrow_mint.decimals,
        )?;
        let seized_collateral = requested_collateral.min(ctx.accounts.position.collateral_amount);

        let repay_accounts = TransferChecked {
            from: ctx.accounts.liquidator_borrow_account.to_account_info(),
            mint: ctx.accounts.borrow_mint.to_account_info(),
            to: ctx.accounts.liquidity_vault.to_account_info(),
            authority: ctx.accounts.liquidator.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), repay_accounts),
            debt,
            ctx.accounts.borrow_mint.decimals,
        )?;

        let collateral_key = ctx.accounts.collateral_mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"market",
            collateral_key.as_ref(),
            &[ctx.accounts.market.bump],
        ]];
        let seize_accounts = TransferChecked {
            from: ctx.accounts.collateral_vault.to_account_info(),
            mint: ctx.accounts.collateral_mint.to_account_info(),
            to: ctx.accounts.liquidator_collateral_account.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                seize_accounts,
                signer_seeds,
            ),
            seized_collateral,
            ctx.accounts.collateral_mint.decimals,
        )?;

        ctx.accounts.position.debt_amount = 0;
        ctx.accounts.position.collateral_amount = ctx
            .accounts
            .position
            .collateral_amount
            .checked_sub(seized_collateral)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_debt = ctx
            .accounts
            .market
            .total_debt
            .checked_sub(debt)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_collateral = ctx
            .accounts
            .market
            .total_collateral
            .checked_sub(seized_collateral)
            .ok_or(LendingError::MathOverflow)?;

        emit!(PositionLiquidated {
            liquidator: ctx.accounts.liquidator.key(),
            owner: ctx.accounts.position.owner,
            market: ctx.accounts.market.key(),
            debt_repaid: debt,
            collateral_seized: seized_collateral,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub borrow_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol: Account<'info, Protocol>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = borrow_mint,
        associated_token::authority = protocol,
        associated_token::token_program = token_program
    )]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = admin @ LendingError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", collateral_mint.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminProtocol<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = admin @ LendingError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,
}

#[derive(Accounts)]
pub struct AdminMarket<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = admin @ LendingError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        seeds = [b"market", market.collateral_mint.as_ref()],
        bump = market.bump,
        has_one = protocol
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"market", collateral_mint.key().as_ref()],
        bump = market.bump,
        has_one = protocol,
        has_one = collateral_mint
    )]
    pub market: Account<'info, Market>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = owner,
        token::token_program = token_program
    )]
    pub owner_collateral_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = borrow_mint
    )]
    pub protocol: Account<'info, Protocol>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    pub borrow_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"market", collateral_mint.key().as_ref()],
        bump = market.bump,
        has_one = protocol,
        has_one = collateral_mint
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner,
        has_one = market
    )]
    pub position: Account<'info, Position>,
    pub price_update: Account<'info, PriceUpdateV2>,
    #[account(
        mut,
        associated_token::mint = borrow_mint,
        associated_token::authority = protocol,
        associated_token::token_program = token_program
    )]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = borrow_mint,
        token::authority = owner,
        token::token_program = token_program
    )]
    pub owner_borrow_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = borrow_mint
    )]
    pub protocol: Account<'info, Protocol>,
    pub borrow_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"market", market.collateral_mint.as_ref()],
        bump = market.bump,
        has_one = protocol
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner,
        has_one = market
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        token::mint = borrow_mint,
        token::authority = owner,
        token::token_program = token_program
    )]
    pub owner_borrow_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = borrow_mint,
        associated_token::authority = protocol,
        associated_token::token_program = token_program
    )]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"market", collateral_mint.key().as_ref()],
        bump = market.bump,
        has_one = protocol,
        has_one = collateral_mint
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner,
        has_one = market
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = owner,
        token::token_program = token_program
    )]
    pub owner_collateral_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = borrow_mint
    )]
    pub protocol: Account<'info, Protocol>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    pub borrow_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"market", collateral_mint.key().as_ref()],
        bump = market.bump,
        has_one = protocol,
        has_one = collateral_mint
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), position.owner.as_ref()],
        bump = position.bump,
        has_one = market
    )]
    pub position: Account<'info, Position>,
    pub price_update: Account<'info, PriceUpdateV2>,
    #[account(
        mut,
        token::mint = borrow_mint,
        token::authority = liquidator,
        token::token_program = token_program
    )]
    pub liquidator_borrow_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = borrow_mint,
        associated_token::authority = protocol,
        associated_token::token_program = token_program
    )]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = liquidator,
        token::token_program = token_program
    )]
    pub liquidator_collateral_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub admin: Pubkey,
    pub borrow_mint: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub protocol: Pubkey,
    pub collateral_mint: Pubkey,
    pub price_feed_id: [u8; 32],
    pub max_ltv_bps: u16,
    pub liquidation_ltv_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub max_price_age_seconds: u64,
    pub max_confidence_bps: u16,
    pub enabled: bool,
    pub total_collateral: u64,
    pub total_debt: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub bump: u8,
}

fn validated_price(
    market: &Market,
    price_update: &Account<PriceUpdateV2>,
) -> Result<pyth_solana_receiver_sdk::price_update::Price> {
    let price = price_update.get_price_no_older_than(
        &Clock::get()?,
        market.max_price_age_seconds,
        &market.price_feed_id,
    )?;
    require!(price.price > 0, LendingError::InvalidOraclePrice);
    let confidence_bps = (u128::from(price.conf))
        .checked_mul(BPS_DENOMINATOR)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(price.price as u128)
        .ok_or(LendingError::MathOverflow)?;
    require!(
        confidence_bps <= u128::from(market.max_confidence_bps),
        LendingError::OracleConfidenceTooWide
    );
    Ok(price)
}

fn checked_pow10(exponent: u32) -> Result<u128> {
    10u128
        .checked_pow(exponent)
        .ok_or_else(|| error!(LendingError::MathOverflow))
}

fn collateral_to_borrow_units(
    collateral_amount: u64,
    collateral_decimals: u8,
    price: i64,
    price_exponent: i32,
    borrow_decimals: u8,
) -> Result<u64> {
    require!(price > 0, LendingError::InvalidOraclePrice);
    let adjustment = price_exponent + i32::from(borrow_decimals) - i32::from(collateral_decimals);
    let base = u128::from(collateral_amount)
        .checked_mul(price as u128)
        .ok_or(LendingError::MathOverflow)?;
    let value = if adjustment >= 0 {
        base.checked_mul(checked_pow10(adjustment as u32)?)
            .ok_or(LendingError::MathOverflow)?
    } else {
        base.checked_div(checked_pow10((-adjustment) as u32)?)
            .ok_or(LendingError::MathOverflow)?
    };
    u64::try_from(value).map_err(|_| error!(LendingError::MathOverflow))
}

fn borrow_to_collateral_units(
    borrow_amount: u64,
    collateral_decimals: u8,
    price: i64,
    price_exponent: i32,
    borrow_decimals: u8,
) -> Result<u64> {
    require!(price > 0, LendingError::InvalidOraclePrice);
    let adjustment = price_exponent + i32::from(borrow_decimals) - i32::from(collateral_decimals);
    let (numerator, denominator) = if adjustment >= 0 {
        (
            u128::from(borrow_amount),
            (price as u128)
                .checked_mul(checked_pow10(adjustment as u32)?)
                .ok_or(LendingError::MathOverflow)?,
        )
    } else {
        (
            u128::from(borrow_amount)
                .checked_mul(checked_pow10((-adjustment) as u32)?)
                .ok_or(LendingError::MathOverflow)?,
            price as u128,
        )
    };
    let rounded_up = numerator
        .checked_add(
            denominator
                .checked_sub(1)
                .ok_or(LendingError::MathOverflow)?,
        )
        .ok_or(LendingError::MathOverflow)?
        .checked_div(denominator)
        .ok_or(LendingError::MathOverflow)?;
    u64::try_from(rounded_up).map_err(|_| error!(LendingError::MathOverflow))
}

fn bps_mul(value: u64, bps: u16) -> Result<u64> {
    let result = u128::from(value)
        .checked_mul(u128::from(bps))
        .ok_or(LendingError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(LendingError::MathOverflow)?;
    u64::try_from(result).map_err(|_| error!(LendingError::MathOverflow))
}

#[event]
pub struct ProtocolInitialized {
    pub admin: Pubkey,
    pub borrow_mint: Pubkey,
}

#[event]
pub struct MarketInitialized {
    pub market: Pubkey,
    pub collateral_mint: Pubkey,
    pub price_feed_id: [u8; 32],
}

#[event]
pub struct ProtocolPauseChanged {
    pub paused: bool,
}

#[event]
pub struct MarketStatusChanged {
    pub market: Pubkey,
    pub enabled: bool,
}

#[event]
pub struct CollateralDeposited {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub amount: u64,
    pub position_collateral: u64,
}

#[event]
pub struct CreditBorrowed {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub amount: u64,
    pub position_debt: u64,
}

#[event]
pub struct CreditRepaid {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub amount: u64,
    pub remaining_debt: u64,
}

#[event]
pub struct CollateralWithdrawn {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub amount: u64,
    pub remaining_collateral: u64,
}

#[event]
pub struct PositionLiquidated {
    pub liquidator: Pubkey,
    pub owner: Pubkey,
    pub market: Pubkey,
    pub debt_repaid: u64,
    pub collateral_seized: u64,
}

#[error_code]
pub enum LendingError {
    #[msg("Only the configured protocol administrator can perform this action")]
    Unauthorized,
    #[msg("The protocol is paused")]
    ProtocolPaused,
    #[msg("This collateral market is disabled")]
    MarketDisabled,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("The requested loan-to-value ratio is outside the protocol limit")]
    InvalidLtv,
    #[msg("The liquidation threshold must be above max LTV and within protocol limits")]
    InvalidLiquidationThreshold,
    #[msg("The liquidation bonus is outside the protocol limit")]
    InvalidLiquidationBonus,
    #[msg("The oracle staleness or confidence configuration is invalid")]
    InvalidOracleConfiguration,
    #[msg("The collateral mint cannot equal the borrow mint")]
    InvalidCollateralMint,
    #[msg("Arithmetic overflow or precision failure")]
    MathOverflow,
    #[msg("The oracle returned a non-positive price")]
    InvalidOraclePrice,
    #[msg("The oracle confidence interval is too wide")]
    OracleConfidenceTooWide,
    #[msg("The position does not support this amount of debt")]
    InsufficientCollateral,
    #[msg("The protocol liquidity vault cannot fund this borrow")]
    InsufficientLiquidity,
    #[msg("Repayment exceeds the outstanding debt")]
    RepayExceedsDebt,
    #[msg("Outstanding debt must be repaid before collateral can be withdrawn")]
    OutstandingDebt,
    #[msg("The position does not contain enough collateral")]
    InsufficientPositionCollateral,
    #[msg("The position has no debt")]
    NoDebt,
    #[msg("The position is above the liquidation health threshold")]
    PositionHealthy,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_collateral_price_to_usdc_units() {
        // 10 tokens with 6 decimals at $2.50, price exponent -8, USDC 6 decimals.
        let value = collateral_to_borrow_units(10_000_000, 6, 250_000_000, -8, 6).unwrap();
        assert_eq!(value, 25_000_000);
    }

    #[test]
    fn inverse_price_conversion_rounds_up() {
        let collateral = borrow_to_collateral_units(25_000_001, 6, 250_000_000, -8, 6).unwrap();
        assert_eq!(collateral, 10_000_001);
    }

    #[test]
    fn ltv_math_never_uses_floating_point() {
        assert_eq!(bps_mul(25_000_000, 3_000).unwrap(), 7_500_000);
    }
}

"""Initial migration - create all tables

Revision ID: 001
Revises:
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite, postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=100), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('nickname', sa.String(length=50), nullable=True),
        sa.Column('avatar_url', sa.String(length=255), nullable=True),
        sa.Column('wx_openid', sa.String(length=100), nullable=True),
        sa.Column('wx_unionid', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('notify_pref', sa.JSON(), nullable=True, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('wx_openid'),
        sa.UniqueConstraint('wx_unionid')
    )
    op.create_index('idx_username', 'users', ['username'])
    op.create_index('idx_email', 'users', ['email'])
    op.create_index('idx_wx_openid', 'users', ['wx_openid'])

    # Create categories table
    op.create_table('categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('color', sa.String(length=7), nullable=False, default='#409EFF'),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, default=0),
        sa.Column('is_default', sa.Boolean(), nullable=False, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_user_id', 'categories', ['user_id'])
    op.create_index('idx_user_sort', 'categories', ['user_id', 'sort_order'])

    # Create tags table
    op.create_table('tags',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=30), nullable=False),
        sa.Column('color', sa.String(length=7), nullable=False, default='#67C23A'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'name', name='uq_user_tag_name')
    )
    op.create_index('idx_tag_user_id', 'tags', ['user_id'])

    # Create tasks table
    op.create_table('tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, default=1),
        sa.Column('status', sa.Integer(), nullable=False, default=0),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_recurring', sa.Boolean(), nullable=False, default=False),
        sa.Column('recurrence_rule', sa.JSON(), nullable=True),
        sa.Column('parent_task_id', sa.Integer(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, default=0),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, default=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.ForeignKeyConstraint(['parent_task_id'], ['tasks.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_user_status', 'tasks', ['user_id', 'status'])
    op.create_index('idx_user_due_date', 'tasks', ['user_id', 'due_date'])
    op.create_index('idx_user_deleted', 'tasks', ['user_id', 'is_deleted'])
    op.create_index('idx_parent_task', 'tasks', ['parent_task_id'])
    op.create_index('idx_recurring', 'tasks', ['is_recurring'])

    # Create task_tags association table
    op.create_table('task_tags',
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('task_id', 'tag_id')
    )
    op.create_index('idx_task_id', 'task_tags', ['task_id'])
    op.create_index('idx_tag_id', 'task_tags', ['tag_id'])

    # Create reminders table
    op.create_table('reminders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('remind_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('remind_type', sa.Integer(), nullable=False, default=0),
        sa.Column('is_sent', sa.Boolean(), nullable=False, default=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_remind_at', 'reminders', ['remind_at'])
    op.create_index('idx_remind_task_id', 'reminders', ['task_id'])
    op.create_index('idx_user_sent', 'reminders', ['user_id', 'is_sent'])

    # Create recurring_instances table
    op.create_table('recurring_instances',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('instance_date', sa.Date(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Integer(), nullable=False, default=0),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_modified', sa.Boolean(), nullable=False, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('task_id', 'instance_date', name='uq_task_instance_date')
    )
    op.create_index('idx_instance_task_date', 'recurring_instances', ['task_id', 'instance_date'])


def downgrade() -> None:
    op.drop_table('recurring_instances')
    op.drop_table('reminders')
    op.drop_table('task_tags')
    op.drop_table('tasks')
    op.drop_table('tags')
    op.drop_table('categories')
    op.drop_table('users')
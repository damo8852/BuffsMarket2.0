import graphene
import django
from django.conf import settings
import jwt
from datetime import datetime, timedelta

# Configure Django settings if not already configured
if not settings.configured:
    django.setup()

from graphene_django import DjangoObjectType
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from graphql_jwt.decorators import login_required
import graphql_jwt

class UserType(DjangoObjectType):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name')

class AuthPayload(graphene.ObjectType):
    token = graphene.String()
    user = graphene.Field(UserType)
    success = graphene.Boolean()
    message = graphene.String()

class LoginMutation(graphene.Mutation):
    class Arguments:
        email = graphene.String(required=True)
        password = graphene.String(required=True)

    Output = AuthPayload
    
    def mutate(self, info, email, password):
        try:
            user = User.objects.get(email=email)
            user = authenticate(username=user.username, password=password)
        except User.DoesNotExist:
            user = None
        if user is not None:
            if user.is_active:
                payload = {
                    'user_id': user.id,
                    'email': user.email,
                    'exp': datetime.utcnow() + timedelta(days=7)
                }
                token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
                return AuthPayload(
                    token=token,
                    user=user,
                    success=True,
                    message="Login successful"
                )
            else:
                return AuthPayload(
                    token=None,
                    user=None,
                    success=False,
                    message="User account is disabled"
                )
        else:
            return AuthPayload(
                token=None,
                user=None,
                success=False,
                message="Invalid credentials"
            )

class RegisterMutation(graphene.Mutation):
    class Arguments:
        username = graphene.String(required=True)
        email = graphene.String(required=True)
        password = graphene.String(required=True)
        first_name = graphene.String()
        last_name = graphene.String()
    
    Output = AuthPayload
    
    def mutate(self, info, username, email, password, first_name="", last_name=""):
        try:
            # Check if user already exists
            if User.objects.filter(username=username).exists():
                return AuthPayload(
                    token=None,
                    user=None,
                    success=False,
                    message="Username already exists"
                )
            
            if User.objects.filter(email=email).exists():
                return AuthPayload(
                    token=None,
                    user=None,
                    success=False,
                    message="Email already exists"
                )
            
            # Create new user
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name
            )
            
            # Generate token
            payload = {
                'user_id': user.id,
                'username': user.username,
                'exp': datetime.utcnow() + timedelta(days=7)
            }
            token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
            
            return AuthPayload(
                token=token,
                user=user,
                success=True,
                message="Registration successful"
            )
            
        except Exception as e:
            return AuthPayload(
                token=None,
                user=None,
                success=False,
                message=f"Registration failed: {str(e)}"
            )

class Query(graphene.ObjectType):
    users = graphene.List(UserType)
    user = graphene.Field(UserType, id=graphene.Int(required=True))
    me = graphene.Field(UserType)
    
    def resolve_users(self, info):
        return User.objects.all()
    
    def resolve_user(self, info, id):
        return User.objects.get(pk=id)
    
    @login_required
    def resolve_me(self, info):
        return info.context.user

class Mutation(graphene.ObjectType):
    login = LoginMutation.Field()
    register = RegisterMutation.Field()
    token_auth = graphql_jwt.ObtainJSONWebToken.Field()
    verify_token = graphql_jwt.Verify.Field()
    refresh_token = graphql_jwt.Refresh.Field()

schema = graphene.Schema(query=Query, mutation=Mutation)

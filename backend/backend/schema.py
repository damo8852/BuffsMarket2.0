import graphene
import django
from django.conf import settings

# Configure Django settings if not already configured
if not settings.configured:
    django.setup()

from graphene_django import DjangoObjectType
from django.contrib.auth.models import User

class UserType(DjangoObjectType):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name')

class Query(graphene.ObjectType):
    users = graphene.List(UserType)
    user = graphene.Field(UserType, id=graphene.Int(required=True))
    
    def resolve_users(self, info):
        return User.objects.all()
    
    def resolve_user(self, info, id):
        return User.objects.get(pk=id)

class CreateUser(graphene.Mutation):
    class Arguments:
        username = graphene.String(required=True)
        email = graphene.String(required=True)
        password = graphene.String(required=True)
    
    user = graphene.Field(UserType)
    
    def mutate(self, info, username, email, password):
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password
        )
        return CreateUser(user=user)

class Mutation(graphene.ObjectType):
    create_user = CreateUser.Field()

schema = graphene.Schema(query=Query, mutation=Mutation)
